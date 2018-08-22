const _ = require('lodash')
const Joi = require('joi')
const wreck = require('wreck')
const debug = require('./debug')
const schemas = require('./schemas')
const time = require('./time')
const regexp = require('./regexp')
const ScopedBigNumber = require('./big-number')
const promises = require('./promises')
const createGlobal = require('./create-global')
const prices = require('./prices')
const splitSymbol = require('./split')
const {
  jsonClone,
  captureException,
  // addBaselineSymbols,
  inverse
} = require('./utils')
const defaultConfig = require('./default-config')

const ALT = 'alts'
const FIAT = 'fiats'
const READY = 'ready'

module.exports = Currency

Currency.inverse = inverse
Currency.config = jsonClone(defaultConfig)
Currency.time = jsonClone(time)

Currency.BigNumber = ScopedBigNumber

const globl = createGlobal(Currency, Currency.config)

Currency.prototype = {
  constructor: Currency,
  alts: {},
  fiats: {},
  time: jsonClone(time),
  fxrate: access(FIAT),
  altrate: access(ALT),
  debug,
  wreck,
  captureException,
  captureValidation,
  retrieve,
  global: globl,
  wraptry,
  rates,
  ratio,
  key,
  ratioFromKnown,
  tickerConvertURL,
  init: promises.break(READY, READY),
  ready: promises.make(READY, ready),
  update: promises.break(READY, update),
  getRates,
  watching,
  refreshPrices,
  updatePrices,
  lastUpdated,
  get: function (key) { return this.state[key] },
  set: function (key, value) { this.state[key] = value }
}

function Currency (config_ = {}, runtime) {
  const context = this
  if (!(context instanceof Currency)) {
    return new Currency(config_, runtime)
  }

  const configClone = jsonClone(Currency.config)
  const config = _.assign(configClone, config_)

  let {
    instance
  } = config

  context.state = {}

  context.config = config

  _.assign(context, {
    promises: {},
    alts: context.alts,
    fiats: context.fiats
  }, instance === true ? {
    alts: {},
    fiats: {}
  } : instance)

  const BigNumber = config.BigNumber || ScopedBigNumber
  context.BigNumber = BigNumber

  context.prices = prices(config.oxr, BigNumber)
  context.ready()
}

function access (key) {
  return function (ratio) {
    return this[key][ratio]
  }
}

async function refreshPrices () {
  const context = this
  const prices = await context.prices()
  context.updatePrices(...prices)
}

function updatePrices (fiats, alts) {
  _.assign(this.alts, alts)
  _.assign(this.fiats, fiats)
  this.set('lastUpdated', _.now())
}

function lastUpdated () {
  return this.get('lastUpdated')
}

function tickerConvertURL (currency) {
  return `${this.config.urls.coinmarketcap}/?convert=${currency}`
}

function watching (base, deep) {
  let result = false
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
    ;([b, a] = splitSymbol(base))
  } else {
    return result
  }
  return !!this.rate(a, b)
}

async function wraptry (trier, catcher, finallier) {
  let result, err
  try {
    result = trier && await trier()
  } catch (e) {
    err = e
    this.captureException(err)
    result = catcher ? await catcher(err) : result
  } finally {
    result = finallier ? await finallier(err, result) : result
  }
  return result
}

function captureValidation (key, object, schema, message = (msg) => msg) {
  const context = this
  const { error } = Joi.validate(object, schema)

  if (error) {
    return context.captureException(message(error), {
      extra: {
        [key]: object
      }
    })
  }
}

function update () {
  return this.init()
}

async function ready () {
  const context = this
  const { config } = context

  if (config.helper) {
    await retrieveRatesEndpoint(context)
    return
  }

  await this.refreshPrices()
}

function getRates () {
  const context = this
  const { rates } = context.config
  const {
    url,
    access_token: accessToken
  } = rates
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json'
  }
  const options = {
    headers,
    useProxyP: true
  }

  return context.retrieve(url, options, schemas.currency)
}

async function retrieveRatesEndpoint (context) {
  const getter = () => context.getRates()

  const results = await context.wraptry(getter)

  _.keys(results).forEach((key) => {
    const target = context[key]
    if (!_.isObject(target)) {
      return
    }

    _.extend(target, results[key])
  })
}

async function retrieve (url, props, schema) {
  let result
  const context = this
  const { wreck } = context

  let { payload } = await wreck.get(url, props || {})
  result = payload.toString()

  // courtesy of https://stackoverflow.com/questions/822452/strip-html-from-text-javascript#822464
  if (result.indexOf('<html>') !== -1) {
    result = result.replace(regexp.html, '')
    throw new Error(result)
  }

  result = JSON.parse(result)
  const error = schema ? context.captureValidation('data', result, schema) : null
  if (error) {
    throw new Error(error)
  }

  return result
}

function rates (_base = 'USD') {
  const context = this
  const fiats = context.fiats
  const alts = context.alts
  const base = upper(_base)
  const baseline = fiats[base] || alts[base]
  if (!baseline) {
    return null
  }
  const part1 = reduction(baseline, fiats)
  return reduction(baseline, alts, part1)
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
  if (!_.isString(unknownCurrency)) {
    return false
  }
  const { fiats, alts } = context
  if (fiats[unknownCurrency] || alts[unknownCurrency]) {
    return unknownCurrency
  }
  const suggestion = upper(unknownCurrency)
  if (fiats[suggestion] || alts[suggestion]) {
    return suggestion
  }
  return false
}

function upper (currency) {
  return currency.toUpperCase()
}

function ratio (_unkA, _unkB) {
  const unkA = upper(_unkA)
  const unkB = upper(_unkB)
  const context = this
  const {
    fiats,
    alts
  } = context
  if (fiats[unkA]) {
    if (fiats[unkB]) {
      return context.ratioFromKnown(FIAT, unkA, FIAT, unkB)
    } else if (alts[unkB]) {
      return context.ratioFromKnown(FIAT, unkA, ALT, unkB)
    }
  } else if (alts[unkA]) {
    if (alts[unkB]) {
      return context.ratioFromKnown(ALT, unkA, ALT, unkB)
    } else if (fiats[unkB]) {
      return context.ratioFromKnown(ALT, unkA, FIAT, unkB)
    }
  }
}

function ratioFromKnown (baseA, _keyA, baseB, _keyB) {
  const context = this
  const keyA = upper(_keyA)
  const keyB = upper(_keyB)
  const baseAHash = context[baseA]
  const baseBHash = context[baseB]
  const numA = baseAHash[keyA]
  const numB = baseBHash[keyB]
  return numB.dividedBy(numA)
}
