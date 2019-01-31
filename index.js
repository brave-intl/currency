const _ = require('lodash')
const wreck = require('wreck')
const debug = require('./debug')
const time = require('./time')
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

const PROMISES = 'promises'
const DEFAULT_ALT = 'BAT'
const USD = 'USD'
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

function generatePrices (context, options) {
  const currency = this
  const { date } = options
  const altPromise = getAlts(currency, context, options)
  const oxrPromise = getFiats(currency, context, options)
  return Promise.all([
    altPromise,
    oxrPromise
  ]).then((result) => {
    const alt = result[0]
    const fiat = result[1]
    return {
      errors: alt.errors.concat(fiat.errors),
      converted: !!date,
      alt: alt.prices,
      fiat: fiat.prices
    }
  })
}

async function getFiats (currency, context, options) {
  const { date } = options
  const { oxr } = context
  const errors = []
  let prices = {}
  try {
    prices = await (date ? oxr.historical(date) : oxr.latest()).then(({
      rates
    }) => rates)
  } catch (ex) {
    errors.push(ex)
  }
  return {
    prices,
    errors
  }
}

function getAlts (currency, context, options) {
  const { date } = options
  const { binance } = context
  return date ? historical(currency, context, options) : binanceCaller(binance)
}

function historical (currency, context, {
  date,
  base = 'usd',
  currency: curr = DEFAULT_ALT
}) {
  const {
    BigNumber
  } = currency
  const {
    coinmetrics
  } = context
  const currencies = _.split(curr, ',')
  const one = new BigNumber(1)
  const d = new Date(date)
  const num = (d - (d % time.DAY)) / 1000
  const errors = []
  return Promise.all(currencies.map(async (curr) => {
    const lower = curr.toLowerCase()
    const upper = curr.toUpperCase()
    const key = `price(${base})`
    const {
      result
    } = await coinmetrics.getAssetDataForTimeRange(lower, key, num, num)
    const error = result.error
    if (error) {
      currency.captureException(error)
      errors.push(error)
      return {}
    }
    const dateData = result[0]
    const price = dateData[1]
    return {
      [upper]: one.dividedBy(price)
    }
  })).then((results) => {
    return {
      prices: _.assign({}, ...results),
      errors
    }
  })
}

function binanceCaller (binance) {
  return new Promise((resolve, reject) => {
    binance.prices((error, prices) => {
      const result = {}
      if (error) {
        result.errors = [error]
      } else {
        result.prices = prices
        result.errors = []
      }
      resolve(result)
    })
  })
}

function defaultState () {
  return {
    promises: {},
    [ALT]: {},
    [FIAT]: {},
    [LAST_UPDATED]: null
  }
}

function getPromises (context) {
  return context.get(PROMISES)
}

async function refreshPrices (options) {
  const prices = await this.prices(options)
  this.save(now(), prices)
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
  return false
}

function access (group) {
  return function (key) {
    return this.get([group, key])
  }
}

function getUnknown (key) {
  return this.fiat(key) || this.alt(key)
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
  if (fiats[unkA]) {
    if (fiats[unkB]) {
      return context.ratioFromConverted(FIAT, unkA, FIAT, unkB)
    } else if (alts[unkB]) {
      return context.ratioFromConverted(FIAT, unkA, ALT, unkB)
    }
  } else if (alts[unkA]) {
    if (alts[unkB]) {
      return context.ratioFromConverted(ALT, unkA, ALT, unkB)
    } else if (fiats[unkB]) {
      return context.ratioFromConverted(ALT, unkA, FIAT, unkB)
    }
  }
}

function ratioFromConverted (baseA, keyA, baseB, keyB) {
  const context = this
  const a = context[baseA](keyA)
  const b = context[baseB](keyB)
  if (!a || !b) {
    return 0
  }
  return b.dividedBy(a)
}

function ratioFromKnown (baseA, _keyA, baseB, _keyB) {
  const context = this
  const keyA = context.key(_keyA)
  const keyB = context.key(_keyB)
  return context.ratioFromConverted(baseA, keyA, baseB, keyB)
}
