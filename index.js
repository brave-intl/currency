const _ = require('lodash')
const Joi = require('@hapi/joi')
const Boom = require('@hapi/boom')
const https = require('https')
const wreck = require('wreck')
const querystring = require('querystring')
const debug = require('./debug')
const time = require('./time')
const ScopedBigNumber = require('./big-number')
const promises = require('./promises')
const createGlobal = require('./create-global')
const prices = require('./prices')
const splitSymbol = require('./split')
const {
  timeout,
  jsonClone,
  inverse
} = require('./utils')
const defaultConfig = require('./default-config')

const DEFAULT_ALT = 'BAT'
const PROMISES = 'promises'
const USD = 'USD'
const LAST_UPDATED = 'LAST_UPDATED'
const ALT = 'alt'
const FIAT = 'fiat'
const ERRORS = 'errors'
const READY = 'ready'

const metricDataValidator = Joi.object().keys({
  metricData: Joi.object().keys({
    metrics: Joi.array().items(Joi.string()),
    series: Joi.array().items(Joi.object().keys({
      time: Joi.date().iso(),
      values: Joi.array().items(Joi.string())
    }))
  })
})

module.exports = Currency

const clonedConfig = jsonClone(defaultConfig)
const globl = createGlobal(Currency, clonedConfig)

Currency.inverse = inverse
Currency.config = clonedConfig
Currency.global = globl
Currency.time = jsonClone(time)

Currency.BigNumber = ScopedBigNumber

Currency.prototype = {
  constructor: Currency,
  time: jsonClone(time),
  debug,
  wreck,
  global: globl,
  rates,
  ratio,
  key,
  has,
  base,
  getUnknown,
  request,
  fiat: access(FIAT),
  alt: access(ALT),
  ratioFromKnown,
  ratioFromConverted,
  watching,
  lastUpdated,
  byDay,
  quickTimeout,
  serviceUnavailable,
  ready: promises.maker(READY, getPromises, ready),
  update: promises.breaker(READY, getPromises),
  save,
  get: function (key) { return _.get(this.state, key, null) },
  set: function (key, value) { _.set(this.state, key, value) },
  reset: function () {
    this.state = defaultState()
  }
}

function Currency (config_ = {}) {
  const context = this
  if (!(context instanceof Currency)) {
    return new Currency(config_)
  }

  const configClone = jsonClone(Currency.config)
  const config = _.extend(configClone, config_)
  const BigNumber = config.BigNumber || ScopedBigNumber
  context.config = config
  context.BigNumber = BigNumber
  config.BigNumber = BigNumber

  context.reset()
  context.prices = prices(config, generatePrices, BigNumber)
}

function generatePrices (context, options) {
  const currency = this
  const { date } = options
  const gettingAlts = getAlts(currency, context, options)
  const gettingFiats = getFiats(currency, context, options)
  const altPromise = currency.quickTimeout(ALT, gettingAlts)
  const oxrPromise = currency.quickTimeout(FIAT, gettingFiats)
  return Promise.all([
    altPromise,
    oxrPromise
  ]).then(([alt, fiat]) => {
    return {
      converted: !!date,
      alt,
      fiat
    }
  })
}

function quickTimeout (key, promise) {
  const { config } = this
  const { maxWait } = config
  return Promise.race([
    promise,
    timeout(maxWait).then(() => this.serviceUnavailable(key))
  ])
}

function serviceUnavailable (key) {
  return {
    // use previous prices since we don't merge later
    prices: this.get(key),
    errors: [Boom.gatewayTimeout(`${key} service is unavailable`)]
  }
}

async function getFiats (currency, context, options) {
  const { date } = options
  const { oxr } = context
  const method = date ? oxr.historical(date) : oxr.latest()
  return handleResult(currency, FIAT, method.then(({
    rates
  }) => ({
    prices: rates,
    errors: []
  })))
}

function getAlts (currency, context, options) {
  const fn = options.date ? historical : requestUpholdTickers
  return handleResult(currency, ALT, fn(currency, context, options))
}

async function handleResult (currency, key, prom) {
  return prom.then(({
    prices,
    errors
  }) => ({
    stale: _.isEmpty(prices),
    prices: prices,
    errors
  })).catch((err) => ({
    stale: true,
    prices: currency.get(key),
    errors: [Boom.boomify(err)]
  }))
}

function historical (currency, context, {
  date,
  base = 'usd',
  currency: curr = DEFAULT_ALT
}) {
  const currencies = _.split(curr, ',')
  const d = new Date(date)
  const start = new Date(d - (d % time.DAY))
  const errors = []
  return Promise.all(currencies.map((curr) => {
    return getAssetDataForTimeRange(currency, errors, curr, start.toISOString())
  })).then((results) => ({
    prices: _.assign({}, ...results),
    errors
  }))
}

function getAssetDataForTimeRange (currency, errors, ticker, start) {
  const {
    BigNumber
  } = currency
  const lower = ticker.toLowerCase()
  const upper = ticker.toUpperCase()
  const one = new BigNumber(1)
  const qs = querystring.stringify({
    time_interval: 'day',
    metrics: 'PriceUSD',
    start,
    end: start
  })
  return currency.request({
    hostname: 'community-api.coinmetrics.io',
    protocol: 'https:',
    path: `/v2/assets/${lower}/metricdata?${qs}`,
    method: 'GET'
  }).then((json) => {
    return Joi.validate(json, metricDataValidator)
  }).then((value) => {
    const price = value.metricData.series[0].values[0]
    return {
      [upper]: one.dividedBy(price)
    }
  }).catch((error) => {
    currency.captureException(error)
    errors.push(error)
    return {}
  })
}

async function request (options) {
  return new Promise((resolve, reject) => {
    const {
      headers,
      body: payload
    } = options
    const opts = Object.assign({
      protocol: 'https:',
      method: 'GET',
      headers: Object.assign({
        'Content-Type': 'application/json'
      }, headers)
    }, options)
    const { method } = opts
    const methodIsGet = method.toLowerCase() === 'get'
    const req = https.request(options, (res) => {
      res.setEncoding('utf8')
      const chunks = []
      res.on('data', (chunk) => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        const body = chunks.join('')
        const { statusCode } = res
        try {
          const json = JSON.parse(body)
          if (statusCode < 200 || statusCode >= 400) {
            failure(new Error(`request failed`), statusCode, json, body)
          } else {
            resolve(json)
          }
        } catch (e) {
          failure(e, statusCode)
        }
      })
    })
    req.on('error', (e) => failure(e))
    if (payload && !methodIsGet) {
      const data = _.isObject(payload) ? JSON.stringify(payload) : payload
      req.write(data)
    }
    req.end()

    function failure (err, statusCode, json, body) {
      reject(Object.assign(err, {
        statusCode,
        opts,
        body,
        payload,
        json
      }))
    }
  })
}

async function requestUpholdTickers (currency) {
  const options = {
    hostname: 'api.uphold.com',
    protocol: 'https:',
    path: '/v0/ticker/USD',
    method: 'GET'
  }
  try {
    const json = await currency.request(options)
    const justUSD = json.reduce((memo, {
      currency,
      pair,
      ask
    }) => {
      if (currency !== 'USD') {
        let alt = pair.slice(3)
        if (alt[0] === '-') {
          alt = alt.slice(1)
        }
        memo[alt] = ask
      }
      return memo
    }, {})
    delete justUSD.USD
    return {
      prices: justUSD,
      errors: []
    }
  } catch (e) {
    return {
      prices: {},
      errors: [e]
    }
  }
}

function defaultState () {
  return {
    [PROMISES]: {},
    [ALT]: {},
    [FIAT]: {},
    [LAST_UPDATED]: null
  }
}

function getPromises (context) {
  return context.get(PROMISES)
}

async function ready (options = {}) {
  const payload = await this.prices(options)
  const {
    update,
    fiat,
    alt,
    errors = []
  } = payload
  const valid = !errors.length
  if (update) {
    if (valid) {
      this.save(now(), {
        fiat,
        alt
      })
    }
    this.set(ERRORS, errors)
  }
  return update && valid
}

function save (lastUpdated, {
  alt,
  fiat
}) {
  const context = this
  context.set(LAST_UPDATED, lastUpdated)
  context.set(ALT, alt)
  context.set(FIAT, fiat)
}

function now () {
  return (new Date()).toISOString()
}

function lastUpdated () {
  return this.get(LAST_UPDATED)
}

function watching (base, deep) {
  const result = false
  let a = base
  let b = deep
  if (base && deep) {
    if (base.length > 4 || deep.length > 4) {
      return result
    }
  } else if (base) {
    if (base.length > 8 || base.length < 6) {
      return result
    }
    const split = splitSymbol(base)
    if (!split.length) {
      return result
    }
    b = split[0]
    a = split[1]
  } else {
    return result
  }
  return this.ratio(a, b).toString() > 0
}

function byDay (date) {
  if (!date) {
    return byDay(new Date())
  }
  const day = new Date(date)
  const iso = day.toISOString()
  const split = iso.split('T')
  return split[0]
}

function rates (_base) {
  const context = this
  const fiat = context.get(FIAT)
  const alt = context.get(ALT)
  const base = context.key(_base || context.base())
  if (!base) {
    return null
  }
  const baseline = context.getUnknown(base)
  const part1 = reduction(baseline, fiat)
  return reduction(baseline, alt, part1)
}

function base () {
  return USD
}

function reduction (baseline, iterable, memo = {}) {
  const keys = _.keys(iterable)
  return _.reduce(keys, (memo, key) => {
    memo[key] = iterable[key].dividedBy(baseline)
    return memo
  }, memo)
}

function key (unknownCurrency) {
  const context = this
  if (_.isString(unknownCurrency)) {
    if (context.has(unknownCurrency)) {
      return unknownCurrency
    }
    const suggestion = unknownCurrency.toUpperCase()
    if (context.has(suggestion)) {
      return suggestion
    }
  }
  return ''
}

function access (group) {
  return function (key) {
    return this.get([group, key])
  }
}

function getUnknown (key) {
  return this.alt(key) || this.fiat(key)
}

function has (key) {
  return !!this.getUnknown(key)
}

function ratio (_unkA, _unkB) {
  const context = this
  const unkA = context.key(_unkA)
  const unkB = context.key(_unkB)
  const fiats = context.get(FIAT)
  const alts = context.get(ALT)
  if (alts[unkA]) {
    if (alts[unkB]) {
      return context.ratioFromConverted(ALT, unkA, ALT, unkB)
    } else if (fiats[unkB]) {
      return context.ratioFromConverted(ALT, unkA, FIAT, unkB)
    }
  } else if (fiats[unkA]) {
    if (fiats[unkB]) {
      return context.ratioFromConverted(FIAT, unkA, FIAT, unkB)
    } else if (alts[unkB]) {
      return context.ratioFromConverted(FIAT, unkA, ALT, unkB)
    }
  }
  return new context.BigNumber(0)
}

function ratioFromConverted (baseA, keyA, baseB, keyB) {
  const context = this
  const a = context[baseA](keyA)
  const b = context[baseB](keyB)
  if (!a || !b) {
    return new context.BigNumber(0)
  }
  return b.dividedBy(a)
}

function ratioFromKnown (baseA, _keyA, baseB, _keyB) {
  const context = this
  const keyA = context.key(_keyA)
  const keyB = context.key(_keyB)
  return context.ratioFromConverted(baseA, keyA, baseB, keyB)
}
