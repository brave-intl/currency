const _ = require('underscore')
const Joi = require('joi')
const Promise = require('bluebird')
const wreck = require('wreck')
const debug = require('./debug')
const DefaultCache = require('./cache')
const cacheKeys = DefaultCache.keys
const schemas = require('./schemas')
const time = require('./time')
const regexp = require('./regexp')
const globalAltcoinConfig = require('./altcoins')
const ScopedBigNumber = require('./big-number')
const monitors = require('./monitors')
const promises = require('./promises')
const createGlobal = require('./create-global')
const number = require('./number')
const {
  jsonClone,
  captureException,
  inverse
} = require('./utils')
const deepSetGet = require('./get-set')
const defaultConfig = require('./default-config')

const MAINTENANCE = 'maintenance'
const READY = 'ready'

module.exports = Currency

Currency.inverse = inverse
Currency.config = jsonClone(defaultConfig)

const globl = createGlobal(Currency, Currency.config)

const scopedObjectSet = {
  altrates: {},
  fxrates: {},
  tickers: {},
  rates: {}
}

Currency.prototype = {
  constructor: Currency,
  altrates: {},
  fxrates: {},
  tickers: {},
  rates: {},
  monitors,
  time: _.clone(time),
  altrate: accessDeep('altrates'),
  fxrate: accessDeep('fxrates'),
  ticker: accessDeep('tickers'),
  rate: accessDeep('rates'),
  wreck,
  aggregated,
  alt2scale,
  captureException,
  captureValidation,
  alt2fiat,
  fiat2alt,
  dial911,
  retrieve,
  allcoinsHas,
  splitSymbol,
  srcSymbol,
  destSymbol,
  global: globl,
  inkblot,
  wraptry,
  normalize,
  rorschach,
  tickerConvertURL,
  init: promises.break(READY, READY),
  ready: promises.make(READY, ready),
  maintain: promises.break(MAINTENANCE, MAINTENANCE),
  maintenance: promises.make(MAINTENANCE, maintenance),
  getRates,
  allcoinsHasAny,
  printRates,
  altcoinsFind,
  setAcrossRates
}

function Currency (config_ = {}, runtime) {
  const context = this
  if (!(context instanceof Currency)) {
    return new Currency(config_, runtime)
  }

  if (config_.static) {
    return context
  }

  const configClone = jsonClone(Currency.config)
  const config = _.assign(configClone, config_)

  let {
    altcoins,
    altcurrency,
    globalFiats,
    instance,
    Cache = DefaultCache
  } = config

  context.config = config

  const monitors = this.monitors.concat(config.monitors || [])

  _.assign(context, {
    monitors,
    promises: {}
  }, instance === true ? scopedObjectSet : instance)

  context.BigNumber = config.BigNumber || ScopedBigNumber

  context.informs = 0
  context.warnings = 0
  context.cache = new Cache()

  const fiatsCache = {}
  context.fiats = fiatsCache

  // munge
  if (altcurrency && altcoins.indexOf(altcurrency) === -1) {
    altcoins = altcoins.concat(altcurrency)
  }
  config.altcoins = altcoins

  const allcoins = altcoins.slice(0)
  config.allcoins = allcoins

  globalFiats.forEach((fiat) => {
    if (!context.allcoinsHas(fiat)) {
      allcoins.push(fiat)
    }
    fiatsCache[fiat] = true
  })

  context.ready()
}

function tickerConvertURL (currency) {
  return `${this.config.urls.coinmarketcap}/?convert=${currency}`
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

async function ready () {
  const context = this
  const {
    config
  } = context
  const {
    altcoins
  } = config

  await Promise.all(altcoins.map((altcoin) => {
    return globalAltcoinConfig.call(altcoin, 'p', [context])
  }))

  setInterval(() => {
    context.maintain()
  }, 1 * time.MINUTE)

  const monitors = _.map(context.monitors, (monitor) => {
    return monitor(context)
  })

  await Promise.all(monitors.concat([context.maintain()]))
}

function allcoinsHasAny (symbols) {
  return !_.isUndefined(_.find(symbols, (symbol) => {
    return this.allcoinsHas(symbol)
  }))
}

function splitSymbol (symbol) {
  const context = this
  return [
    context.srcSymbol(symbol),
    context.destSymbol(symbol)
  ]
}

function srcSymbol (symbol) {
  return symbol.substr(0, 3)
}

function destSymbol (symbol) {
  let symb = symbol.substr(3)
  if (symb === 'USDT') {
    symb = 'USD'
  }
  return symb
}

function allcoinsHas (str) {
  return this.config.allcoins.indexOf(str) !== -1
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
  const {
    config,
    rates: ratesPointer
  } = context
  const {
    altcoins
  } = config
  const ratesClone = jsonClone(ratesPointer)
  const getter = () => context.getRates()

  const results = await context.wraptry(getter)

  _.keys(results).forEach((key) => {
    const target = context[key]
    if (!_.isObject(target)) {
      return
    }

    _.extend(target, results[key])
  })

  altcoins.forEach((currency) => {
    if (!_.isEqual(ratesClone[currency], ratesPointer[currency])) {
      return
    }
    context.printRates(currency)
  })
}

async function maintenance () {
  const now = _.now()
  const context = this
  let tickers
  let {
    config
  } = context

  if (config.helper) {
    return retrieveRatesEndpoint(context)
  }

  const { oxr } = context

  if (oxr) {
    let fxrates = await context.wraptry(() => oxr.latest())
    let { base, rates } = fxrates
    if (base && rates) {
      context.fxrates = rates
    }
  }

  try {
    tickers = await context.inkblot()
  } catch (ex) {
    if (context.warnings <= now) {
      context.warnings = now + (15 * time.MINUTE)
      context.captureException(ex)
    }
  }

  try {
    await context.rorschach(context.altrates, tickers)
  } catch (ex) {
    if (context.warnings <= now) {
      context.warnings = now + (15 * time.MINUTE)
      context.captureException(ex)
    }
  }

  const altkeys = _.keys(config.altcoins)
  await context.altcoinsFind(altkeys, tickers)
}

function aggregated () {
  const {
    rates,
    fxrates,
    altrates,
    tickers
  } = this
  return {
    rates,
    fxrates,
    altrates,
    tickers
  }
}

function altcoinsFind (keys, tickers) {
  const context = this
  return Promise.all(keys.map((altcoin) => {
    const args = [tickers, context]
    return globalAltcoinConfig.call(altcoin, 'f', args)
  }))
}

async function retrieve (url, props, schema) {
  let result
  const context = this
  const {
    cache,
    wreck
  } = context
  const urlKey = cacheKeys.url(url)

  result = cache.get(urlKey)
  if (result) {
    return result
  }

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

  cache.set(urlKey, result)
  return result
}

async function dial911 () {
  const fiat = 'USD'
  // let entries
  const context = this
  const url = this.tickerConvertURL(fiat)
  const getter = () => this.retrieve(url)

  const entries = await this.wraptry(getter, (ex) => {
    const message = `dial911 ticker error: ${fiat}: ${ex.message}`
    this.captureException(message)
  })

  if (!entries) {
    return
  }
  entries.forEach((entry) => {
    const {
      symbol: src,
      id
    } = entry

    if (context.captureValidation('data', entry, schemas.coinmarketcap)) {
      return
    }

    if (!context.allcoinsHas(src) || !globalAltcoinConfig.has(src, id)) {
      return
    }

    const stringified = JSON.stringify(entry, null, 2)
    console.log(`processing ${stringified}`)
    _.keys(entry).forEach((key) => {
      const dst = key.substr(6).toUpperCase()

      if (src === dst || key.substr(0, 6) !== 'price_') {
        return
      }

      context.altrate(src, dst, entry[key])
    })
  })
}

function accessDeep (key) {
  return function () {
    return deepSetGet(this[key], ...arguments)
  }
}

async function inkblot () {
  const context = this
  const {
    config
  } = context
  const {
    globalFiats
  } = config
  const unavailable = []
  let tickers = {}

  for (let i = globalFiats.length - 1; i >= 0; i--) {
    let fiat = globalFiats[i]

    if ((fiat !== 'USD' || globalFiats.length === 1) && (!tickers[fiat])) {
      await ticker(fiat)
    }
  }

  globalFiats.forEach((fiat) => {
    if (!tickers[fiat]) {
      unavailable.push(fiat)
    }
  })
  if (unavailable.length > 0) {
    const unavailableString = unavailable.join(', ')
    const message = `fiats ${unavailableString} unavailable`
    throw new Error(message)
  }

  return context.normalize(tickers)

  async function ticker (fiat) {
    const url = context.tickerConvertURL(fiat)
    const retriever = () => context.retrieve(url)

    const entries = await context.wraptry(retriever, (ex) => {
      ex.message = `${fiat}: ${ex.message}`
      throw ex
    })

    entries.forEach((entry) => {
      const {
        symbol: src
      } = entry

      if (config.allcoins.indexOf(src) === -1) {
        return
      }

      if (!globalAltcoinConfig.has(src)) {
        const message = `monitor ticker error: no entry for altcoins[${src}]`
        return context.captureException(message)
      }

      if (!globalAltcoinConfig.has(src, entry.id)) {
        return
      }

      const { error } = Joi.validate(entry, schemas.coinmarketcap)
      if (error) {
        const message = `monitor ticker error: ${error}`
        return context.captureException(message, {
          extra: {
            data: entry
          }
        })
      }

      _.keys(entry).forEach((key) => {
        const dst = key.substr(6).toUpperCase()

        if ((src === dst) || (key.indexOf('price_') !== 0)) {
          return
        }

        deepSetGet(tickers, src, dst, entry[key])
      })
    })
  }
}

async function rorschach (rates_, tickers) {
  let informed, now
  const context = this
  const {
    config,
    informs
  } = context
  const {
    globalFiats,
    altcoins
  } = config
  const rates = context.normalize(rates_)

  globalFiats.forEach((fiat) => {
    altcoins.forEach((altcoin) => {
      const rate1 = deepSetGet(rates, altcoin, fiat)
      if (rate1) {
        const rate2 = deepSetGet(tickers, altcoin, fiat)
        compare(altcoin, fiat, rate1, rate2)
      }
    })
  })

  context.tickers = tickers

  now = _.now()
  informed = informs <= now

  altcoins.forEach((currency) => {
    const rate = context.rate(currency)
    const rateClone = jsonClone(rate)

    rates[currency] = _.assign(rateClone, rates[currency] || {})
    const isDifferent = !_.isEqual(rateClone, rate)

    if (informed && isDifferent) {
      context.printRates(currency)
    }
  })
  if (informed) {
    context.informs = now + (1 * time.MINUTE)
  }

  context.normalize(context.rates)
}

function printRates (currency) {
  const context = this
  const {
    rates,
    fiats
  } = context
  const subRates = _.pick(rates[currency], fiats)
  const stringifiedRates = JSON.stringify(subRates)
  debug(`${currency} fiat rates ${stringifiedRates}`)
}

function compare (altcoin, fiat, rate1, rate2) {
  const ratio = rate1 / rate2

  if (ratio >= 0.9 && ratio <= 1.1) {
    return
  }

  debug('rorschach', {
    altcoin,
    fiat,
    rate1,
    rate2
  })
  const message = `${altcoin} error: ${fiat} ${rate1} vs. ${rate2}`
  throw new Error(message)
}

function backfillWithObjects (base, keys) {
  keys.forEach((currency) => {
    if (!base[currency]) {
      base[currency] = {}
    }
  })
}

function normalize (rates) {
  const context = this
  const {
    tickers,
    config
  } = context
  const {
    allcoins,
    altcoins,
    globalFiats
  } = config

  backfillWithObjects(rates, allcoins)

  _.keys(rates).forEach((src) => {
    if (altcoins.indexOf(src) === -1) {
      return
    }

    _.keys(tickers).forEach((dst) => {
      if (src === dst) {
        return
      }

      _.keys(rates[src]).forEach((currency) => {
        context.setAcrossRates(currency, src, dst)
      })
    })
  })

  allcoins.forEach((src) => {
    allcoins.forEach((dst) => {
      if (src === dst || context.rate(src, dst)) {
        return
      }

      _.keys(tickers).forEach((currency) => {
        context.setAcrossRates(currency, src, dst)
      })
    })
  })
  return _.omit(rates, globalFiats)
}

function setAcrossRates (currency, src, dst) {
  const context = this
  if (context.rate(src, dst)) {
    return
  }

  const inverted = context.rate(dst, src)
  if (inverted) {
    context.rate(src, dst, inverse(inverted))
    return
  }

  const ticker = context.ticker(currency, dst)
  const rate = context.rate(src, currency)
  if (!ticker || !rate) {
    return
  }

  const value = ticker * rate
  context.rate(src, dst, value)
}

function alt2scale () {
  return number.alt.scale(...arguments)
}

function alt2fiat (altcurrency, probi, currency, float) {
  const context = this
  const rate = context.rate(altcurrency, currency)
  return number.alt.fiat(context.BigNumber, altcurrency, probi, currency, float, rate)
}

function fiat2alt (currency, amount, altcurrency) {
  const context = this
  const rate = context.rate(altcurrency, currency)
  return number.fiat.alt(context.BigNumber, currency, amount, altcurrency, rate)
}
