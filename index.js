const _ = require('lodash')
const Joi = require('joi')
const wreck = require('wreck')
const {
  getAssetDataForTimeRange
} = require('coinmetrics')
const debug = require('./debug')
const time = require('./time')
const regexp = require('./regexp')
const ScopedBigNumber = require('./big-number')
const promises = require('./promises')
const createGlobal = require('./create-global')
const prices = require('./prices')
const splitSymbol = require('./split')
const {
  jsonClone,
  inverse
} = require('./utils')
const defaultConfig = require('./default-config')

const DEFAULT_ALT = 'BAT'
const USD = 'USD'
const PRICES = 'PRICES'
const LAST_UPDATED = 'LAST_UPDATED'
const ALT = 'alt'
const FIAT = 'fiat'
const READY = 'ready'

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
  retrieve,
  global: globl,
  rates,
  ratio,
  key,
  has,
  base,
  getUnknown,
  fiat: access(FIAT),
  alt: access(ALT),
  ratioFromKnown,
  ratioFromConverted,
  history,
  watching,
  refreshPrices,
  lastUpdated,
  byDay,
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

function generatePrices ({
  binance,
  oxr
}, options) {
  const { date } = options
  const altPromise = date ? historical(options, this) : binanceCaller(binance)
  const oxrPromise = date ? oxr.historical(date) : oxr.latest()
  return Promise.all([
    altPromise,
    oxrPromise.then(({
      rates
    }) => rates)
  ]).then((result) => {
    const alt = result[0]
    const fiat = result[1]
    return {
      converted: !!date,
      alt,
      fiat
    }
  })
}

function historical ({
  date,
  base = 'usd',
  currency = DEFAULT_ALT
}, {
  BigNumber
}) {
  const currencies = _.split(currency, ',')
  const one = new BigNumber(1)
  const d = new Date(date)
  const num = (d - (d % time.DAY)) / 1000
  return Promise.all(currencies.map(async (currency) => {
    const lower = currency.toLowerCase()
    const upper = currency.toUpperCase()
    const key = `price(${base})`
    const {
      result
    } = await getAssetDataForTimeRange(lower, key, num, num)
    if (result.error) {
      throw result.error
    }
    const dateData = result[0]
    const price = dateData[1]
    return {
      [upper]: one.dividedBy(price)
    }
  })).then((results) => {
    return _.assign({}, ...results)
  })
}

function binanceCaller (binance) {
  return new Promise((resolve, reject) => {
    binance.prices((error, prices) => {
      if (error) {
        return reject(error)
      }
      resolve(prices)
    })
  })
}

function defaultState () {
  return {
    promises: {},
    [PRICES]: {},
    [LAST_UPDATED]: null
  }
}

function getPromises (context, date) {
  const promises = context.get('promises')
  const key = date ? byDay(date) : date
  const cache = promises[key] = promises[key] || {}
  return cache
}

async function refreshPrices (options) {
  const { date } = options
  const prices = await this.prices(options)
  if (date) {
    const day = new Date(date)
    await this.history(day, prices)
  } else {
    await this.save(now(), prices)
  }
}

function history (lastUpdated, prices) {
  this.set([PRICES, lastUpdated.toISOString()], prices)
}

function save (lastUpdated, {
  alt,
  fiat
}) {
  const context = this
  const day = byDay(lastUpdated)
  context.set(LAST_UPDATED, lastUpdated)
  context.set([PRICES, day], {
    alt,
    fiat
  })
}

function now () {
  return (new Date()).toISOString()
}

function lastUpdated () {
  return this.get(LAST_UPDATED)
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
    const split = splitSymbol(base)
    if (!split.length) {
      return result
    }
    b = split[0]
    a = split[1]
  } else {
    return result
  }
  return !!this.rate(a, b)
}

async function ready (options = {}) {
  await this.refreshPrices(options)
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
  if (schema) {
    Joi.assert(result, schema)
  }

  return result
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

function rates (passed, _base) {
  const context = this
  const date = byDay(passed)
  const fiat = context.get([PRICES, date, FIAT])
  const alt = context.get([PRICES, date, ALT])
  const base = context.key(date, _base || context.base())
  if (!base) {
    return null
  }
  const baseline = context.getUnknown(date, base)
  if (!baseline) {
    return null
  }
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

function key (date, unknownCurrency) {
  const context = this
  if (_.isString(unknownCurrency)) {
    if (context.has(date, unknownCurrency)) {
      return unknownCurrency
    }
    const suggestion = unknownCurrency.toUpperCase()
    if (context.has(date, suggestion)) {
      return suggestion
    }
  }
  return false
}

function access (group) {
  return function (historical, key) {
    return this.get([PRICES, byDay(historical), group, key])
  }
}

function getUnknown (date, key) {
  return this.fiat(date, key) || this.alt(date, key)
}

function has (date, key) {
  return !!this.getUnknown(date, key)
}

function ratio (date, _unkA, _unkB) {
  const context = this
  const day = byDay(date)
  const unkA = context.key(day, _unkA)
  const unkB = context.key(day, _unkB)
  const fiats = context.get([PRICES, day, FIAT])
  const alts = context.get([PRICES, day, ALT])
  if (fiats[unkA]) {
    if (fiats[unkB]) {
      return context.ratioFromConverted(day, FIAT, unkA, FIAT, unkB)
    } else if (alts[unkB]) {
      return context.ratioFromConverted(day, FIAT, unkA, ALT, unkB)
    }
  } else if (alts[unkA]) {
    if (alts[unkB]) {
      return context.ratioFromConverted(day, ALT, unkA, ALT, unkB)
    } else if (fiats[unkB]) {
      return context.ratioFromConverted(day, ALT, unkA, FIAT, unkB)
    }
  }
}

function ratioFromConverted (date, baseA, keyA, baseB, keyB) {
  const context = this
  const a = context[baseA](date, keyA)
  const b = context[baseB](date, keyB)
  if (!a || !b) {
    return 0
  }
  return b.dividedBy(a)
}

function ratioFromKnown (date, baseA, _keyA, baseB, _keyB) {
  const context = this
  const keyA = context.key(date, _keyA)
  const keyB = context.key(date, _keyB)
  return context.ratioFromConverted(date, baseA, keyA, baseB, keyB)
}
