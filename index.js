const _ = require('lodash')
const Joi = require('joi')
const wreck = require('wreck')
const debug = require('./debug')
// const schemas = require('./schemas')
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
  inverse
} = require('./utils')
const defaultConfig = require('./default-config')

const USD = 'USD'
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
  shared: shared(),
  time: jsonClone(time),
  fxrate: access(FIAT),
  altrate: access(ALT),
  sharedGet,
  sharedSet,
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
  has,
  base,
  getUnknown,
  fiat,
  alt,
  deepGet,
  ratioFromKnown,
  ratioFromConverted,
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

  _.assign(context, {
    promises: {},
    shared: context.shared,
    config,
    state: {}
  }, instance === true ? {
    shared: shared()
  } : instance)

  const BigNumber = config.BigNumber || ScopedBigNumber
  context.BigNumber = BigNumber

  context.prices = prices(config.oxr, BigNumber)
  context.ready()
}

function shared () {
  return {
    alts: {},
    fiats: {}
  }
}

function access (key) {
  return function (ratio) {
    return this.sharedGet(key)[ratio]
  }
}

async function refreshPrices () {
  const context = this
  const prices = await context.prices()
  context.updatePrices(...prices)
}

function sharedSet (key, object) {
  this.shared[key] = object
}

function updatePrices (_fiats, _alts) {
  this.sharedSet(ALT, _alts)
  this.sharedSet(FIAT, _fiats)
  this.set('lastUpdated', _.now())
}

function lastUpdated () {
  return this.get('lastUpdated') || 0
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
  const getter = () => context.getRates()
  const results = await context.wraptry(getter)
  const { BigNumber } = context

  _.forOwn(results, (result, key) => {
    const target = context.sharedGet(key)
    if (!_.isObject(target)) {
      return
    }

    const values = _.mapValues(result, (value) => new BigNumber(value))
    this.sharedSet(key, values)
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

function rates (_base) {
  const context = this
  const fiat = context.sharedGet(FIAT)
  const alt = context.sharedGet(ALT)
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

function deepGet (hash, currency) {
  return this.sharedGet(hash)[currency]
}

function sharedGet (hash) {
  return this.shared[hash] || {}
}

function fiat (key) {
  return this.deepGet(FIAT, key) || null
}

function alt (key) {
  return this.deepGet(ALT, key) || null
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
  const fiats = context.sharedGet(FIAT)
  const alts = context.sharedGet(ALT)
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
