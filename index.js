const _ = require('lodash')
const Joi = require('joi')
const wreck = require('wreck')
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
  retrieve,
  global: globl,
  rates,
  ratio,
  key,
  has,
  base,
  getUnknown,
  fiat,
  alt,
  ratioFromKnown,
  ratioFromConverted,
  getRates,
  watching,
  refreshPrices,
  lastUpdated,
  ready: promises.maker(READY, getPromises, ready),
  update: promises.breaker(READY, getPromises),
  save,
  get: function (key) { return _.get(this.state, key, null) },
  set: function (key, value) { _.set(this.state, key, value) }
}

function Currency (config_ = {}) {
  const context = this
  if (!(context instanceof Currency)) {
    return new Currency(config_)
  }

  const configClone = jsonClone(Currency.config)
  const config = _.assign(configClone, config_)

  _.assign(context, {
    config,
    state: defaultState()
  })

  const BigNumber = config.BigNumber || ScopedBigNumber
  context.BigNumber = BigNumber

  context.prices = prices(config.oxr, BigNumber)
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
  return context.state.promises
}

async function refreshPrices () {
  const prices = await this.prices()
  await this.save(now(), prices)
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
    ;([b, a] = splitSymbol(base))
  } else {
    return result
  }
  return !!this.rate(a, b)
}

async function ready () {
  const context = this
  const { config } = context
  const { rates } = config
  const {
    url,
    access_token: token
  } = rates

  if (url && token) {
    await retrieveRatesEndpoint(context)
  } else {
    await context.refreshPrices()
  }
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

  return context.retrieve(url, options)
}

async function retrieveRatesEndpoint (context) {
  const results = await context.getRates()
  const { BigNumber } = context

  _.forOwn(results, (result, key) => {
    const target = context.get(key)
    if (!_.isObject(target)) {
      return
    }

    const values = _.mapValues(result, (value) => new BigNumber(value))
    context.set(key, values)
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
  if (schema) {
    Joi.assert(result, schema)
  }

  return result
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

function fiat (key) {
  return this.get([FIAT, key])
}

function alt (key) {
  return this.get([ALT, key])
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
