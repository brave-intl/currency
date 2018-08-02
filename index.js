const _ = require('underscore')
const BigNumber = require('bignumber.js')
const Joi = require('joi')
const NodeCache = require('node-cache')
const Promise = require('bluebird')
const SDebug = require('sdebug')
const WebSocket = require('faye-websocket')
const binance = require('node-binance-api')
const currencyCodes = require('currency-codes')
const debug = new SDebug('currency')
const oxr = require('oxr')
const wreck = require('wreck')
const schemas = require('./schemas')
const time = require('./time')
const regexp = require('./regexp')
const decimals = require('./decimals')

module.exports = Currency

const ScopedBigNumber = BigNumber.clone()
ScopedBigNumber.config({
  EXPONENTIAL_AT: 28,
  DECIMAL_PLACES: 18
})

let globalInstance

const defaultConfig = {
  globalFiats: ['USD', 'EUR'],
  altcoins: ['BAT', 'ETH'],
  gdaxSocketURL: 'wss://ws-feed.gdax.com/',
  rates: {
    url: 'http://localhost:3004/v1/rates',
    access_token: '00000000-0000-4000-0000-000000000000'
  }
}

Currency.config = defaultConfig

Currency.prototype = {
  constructor: Currency,
  altrates: {},
  fxrates: {},
  rates: {},
  init,
  alt2scale,
  fiatP,
  captureException,
  currencyToNumber,
  alt2fiat,
  fiat2alt,
  dial911,
  getFiatRate,
  retrieve,
  monitor1,
  monitor2,
  monitor3,
  allcoinsHas,
  splitSymbol,
  srcSymbol,
  destSymbol,
  global,
  inkblot
}

const globalAltcoinConfig = {
  _internal: {
    f: async (altcoin, tickers, context) => {
      const {
        cache,
        config
      } = context
      const fiats = cache.get('fiats:' + altcoin)

      if (!fiats) {
        return
      }

      const fiatGetter = context.getFiatRate(altcoin)

      const {
        rates,
        unavailable
      } = fiats.reduce(fiatGetter, {
        rates: {},
        unavailable: []
      })
      if (unavailable.length > 0) {
        return context.captureException(altcoin + '.f fiat error: ' + unavailable.join(', ') + ' unavailable')
      }

      const target = {}
      target[altcoin] = rates
      try {
        await context.rorschach(target, tickers)
      } catch (ex) {
        let now = _.now()
        if (context.warnings > now) {
          return
        }

        context.warnings = now + (15 * time.minute)
        context.captureException(ex)
        return
      }
    }
  },

  BAT: {
    id: 'basic-attention-token'
  },

  BTC: {
    id: 'bitcoin',

    f: async (tickers, context) => {
      return globalAltcoinConfig._internal.f('BTC', tickers, context)
    }
  },

  ETH: {
    id: 'ethereum',

    f: async (tickers, context) => {
      return globalAltcoinConfig._internal.f('ETH', tickers, context)
    }
  },

  LTC: {
    id: 'litecoin',

    f: async (tickers, context) => {
      return globalAltcoinConfig._internal.f('LTC', tickers, context)
    }
  }
}

function global() {
  if (!globalInstance) {
    globalInstance = new Currency(this.config)
  }
  return globalInstance
}

function Currency(config_ = {}, runtime) {
  const context = this
  if (!(context instanceof Currency)) {
    return new Currency(config_, runtime)
  }

  if (config_.static) {
    context.init()
    return context
  }

  const stdTTL = 1 * time.minute
  const cache = new NodeCache({
    stdTTL
  })

  const config = _.assign({}, defaultConfig, config_)

  let {
    altcoins,
    altcurrency,
    static,
    globalFiats
  } = config

  context.config = config

  context.BigNumber = config.BigNumber || ScopedBigNumber

  context.informs = 0
  context.warnings = 0
  context.cache = cache

  const fiatsCache = {}
  context.fiats = fiatsCache
  context.tickers = {}

  if (altcurrency && altcoins.indexOf(altcurrency) === -1) {
    // munge
    altcoins = altcoins.concat(altcurrency)
  }
  config.altcoins = altcoins

  allcoins = _.clone(altcoins)
  config.allcoins = allcoins
  globalFiats.forEach((fiat) => {
    if (!context.allcoinsHas(fiat)) {
      allcoins.push(fiat)
    }
    fiatsCache[fiat] = true
  })
}

function captureException() {
  console.log(...arguments)
}

function init() {
  const context = this
  const {
    config
  } = context

  config.altcoins.forEach((altcoin) => {
    const f = globalAltcoinConfig[altcoin]

    if (f && f.p) {
      f.p(context)
    }
  })

  setInterval(() => {
    context.maintenance()
  }, 1 * time.minute)

  if (config.helper) {
    context.maintenance()
    return
  }

  context.monitor1()
  context.monitor2()
  context.monitor3()
}

function addBaselineSymbols(symbols, altcoin) {
  if (altcoin === 'BTC') {
    symbols.push('BTCUSDT')
  } else if (altcoin === 'ETH') {
    symbols.push('ETHUSDT', 'ETHBTC')
  } else {
    symbols.push(altcoin.split('-').join('') + 'BTC')
  }
  return symbols
}

function monitor1() {
  const context = this
  const { config } = context
  const symbols = config.altcoins.reduce(addBaselineSymbols, [])

  debug('monitor1', {
    symbols
  })

  symbols.forEach((symbol) => {
    monitor1a(symbol, false, context)
  })
}

function monitor1a(symbol, retryP, singleton) {
  const context = this
  const { config } = singleton
  if (retryP) {
    debug('monitor1', {
      symbol,
      retryP
    })
  }

  const event = symbol.toLowerCase() + '@aggTrade'
  binance.websockets.subscribe(event, (trade) => {
    const { error } = Joi.validate(trade, schemas.binance)

    if (error) {
      return context.captureException(error, {
        extra: {
          trade
        }
      })
    }

    const {
      p: price,
      e: event,
      s: symbol
    } = trade
    const [
      src,
      dest
    ] = singleton.splitSymbol(symbol)

    singleton.flatline = false
    if (event !== 'aggTrade' || src === dest || !singleton.allcoinsHasAny([src, dest])) {
      return
    }

    singleton.altrate(src, dest, price)

  }, () => {
    setTimeout(function() {
      monitor1a(symbol, true, singleton)
    }, 15 * time.second)
  })
}

function allcoinsHasAny(symbols) {
  return _.find(symbols, (symbol) => this.allcoinsHas(symbol)) !== undefined
}

function splitSymbol(symbol) {
  const context = this
  return [
    context.src(symbol),
    context.dist(symbol)
  ]
}

function srcSymbol(symbol) {
  return symbol.substr(0, 3)
}

function destSymbol(symbol) {
  let symb = symbol.substr(3)
  if (symb === 'USDT') {
    symb = 'USD'
  }
  return symb
}

function allcoinsHas(str) {
  return this.config.allcoins.indexOf(str) !== -1
}

function getFiatRate(altcoin) {
  const { cache } = this
  return (memo, fiat) => {
    const { rates, unavailable } = memo
    const rate = cache.get('ticker:' + altcoin + fiat)
    rates[fiat] = (rate && rate.last) || (unavailable.push(fiat) && undefined)
    return memo
  }
}

function monitor2() {
  const singleton = this
  let {
    config,
    cache,
    gdax
  } = singleton

  if (gdax) {
    return
  }

  const query = []
  const symbols = []
  const {
    altcoins,
    gdaxSocketURL
  } = config

  altcoins.forEach((altcoin) => {
    const eligible = []

    if ((!altcoins[altcoin]) || (altcoin === 'BAT')) {
      return
    }

    fiats.forEach((fiat) => {
      const product_id = altcoin + '-' + fiat
      query.push({
        type: 'subscribe',
        product_id
      })
      symbols.push(product_id)
      eligible.push(fiat)
    })

    cache.set('fiats:' + altcoin, eligible)
  })

  debug('monitor2', {
    symbols: symbols
  })

  gdax = new WebSocket.Client(gdaxSocketURL)
  singleton.gdax = gdax

  gdax.on('open', (event) => {
    debug('monitor2', {
      event: 'connected',
      connected: true
    })
  })
  gdax.on('close', (event) => {
    if (event.code !== 1000) {
      let eventValues = _.pick(event, [
        'code',
        'reason'
      ])
      let extendedEventValues = _.extend({
        event: 'disconnected'
      }, eventValues)
      debug('monitor2', extendedEventValues)
    }
    retry()
  })
  gdax.on('error', (event) => {
    debug('monitor2', {
      event: 'error',
      message: event.message
    })
    retry()
  })
  gdax.on('message', (event) => {
    let { data } = event
    if (_.isUndefined(data)) {
      retry()
      return this.captureException(new Error('no event.data'))
    }

    try {
      data = JSON.parse(data)
    } catch (ex) {
      retry()
      return this.captureException(ex)
    }

    let {
      type,
      price,
      product_id: productID
    } = data

    if (_.isUndefined(type) || _.isUndefined(price)) {
      return
    }

    const { error } = Joi.validate(data, schemas.gdax)
    if (error) {
      retry()
      return this.captureException(error, {
        extra: {
          data
        }
      })
    }

    const squishedID = product_id.replace('-', '')
    const priceInt = parseFloat(price)
    cache.set('ticker:' + squishedID, priceInt)
  })
  try {
    query.forEach((symbol) => {
      gdax.send(JSON.stringify(symbol))
    })
  } catch (ex) {
    retry()
    return this.captureException(ex)
  }

  function retry() {
    try {
      if (gdax) {
        gdax.end()
      }
    } catch (ex) {
      debug('monitor2', {
        event: 'end',
        message: ex.toString()
      })
    }

    gdax = undefined
    setTimeout(() => {
      singleton.monitor2(config)
    }, 15 * time.second)
  }
}

function monitor3() {
  let cacheTTL
  const singleton = this
  const { config } = singleton
  const { xor } = config

  if (!oxr) {
    return
  }

  cacheTTL = parseInt(oxr.cacheTTL, 10)

  if (isNaN(cacheTTL) || (cacheTTL < 1)) {
    cacheTTL = 7 * 24 * 1000 * 3600
  }

  const factory = oxr.factory({
    appId: oxr.apiID
  })
  const store = {
    get: function() {
      return Promise.resolve(this.value)
    },
    put: function(value) {
      this.value = value
      return Promise.resolve(value)
    }
  }
  const ttl = parseInt(cacheTTL, 10)
  const options = {
    store,
    ttl
  }

  singleton.oxr = oxr.cache(options, factory)
}

async function maintenance() {
  const now = _.now()
  const context = this
  let fxrates, rates, results, tickers
  let {
    flatline,
    config,
    rates: ratesPointer
  } = context
  const {
    rates
  } = config

  if (helper) {
    ratesClone = JSON.parse(JSON.stringify(ratesPointer))

    try {
      results = await this.retrieve(rates.url, {
        headers: {
          authorization: 'Bearer ' + rates.access_token,
          'content-type': 'application/json'
        },
        useProxyP: true
      }, schemas.currency)
    } catch (ex) {
      context.captureException(ex)
    }

    _.keys(results).forEach((key) => {
      if (_.isObject(context[key])) {
        return
      }

      _.extend(context[key], results[key])
    })
    config.altcoins.forEach((currency) => {
      if (_.isEqual(ratesClone[currency], ratesPointer[currency])) {
        return
      }
      const fiatCurrencies = _.pick(ratesPointer[currency], fiats)
      const stringFiatCurrencies = JSON.stringify(fiatCurrencies)
      debug(currency + ' fiat rates', stringFiatCurrencies)
    })

    return
  }

  if (flatline) {
    debug('maintenance', {
      message: 'no trades reported'
    })
    this.captureException(new Error('maintenance reports flatline'))
    if (process.env.NODE_ENV !== 'production') process.exit(0)

    await this.dial911(config)
  }
  context.flatline = true

  const { xor } = context

  if (oxr) {
    try {
      fxrates = await oxr.latest()
    } catch (ex) {
      this.captureException(ex)
    }
    if ((fxrates) && (fxrates.rates)) {
      context.fxrates = fxrates
    }
  }

  try {
    tickers = await this.inkblot()
  } catch (ex) {
    if (context.warnings <= now) {
      context.warnings = now + (15 * time.minute)
      this.captureException(ex)
    }
  }

  try {
    await this.rorschach(context.altrates, tickers)
  } catch (ex) {
    if (context.warnings <= now) {
      context.warnings = now + (15 * time.minute)
      this.captureException(ex)
    }
  }

  for (let altcoin of config.altcoins) {
    const f = globalAltcoinConfig[altcoin]

    if (f && f.f) {
      await f.f(tickers, context)
    }
  }
}

function currencyToNumber(rates) {
  return _.mapObject(rates, (sub) => {
    return _.mapObject(sub, (value) => {
      return +value
    })
  })
}

async function retrieve(url, props, schema) {
  let result
  const singleton = this

  result = singleton.cache.get('url:' + url)
  if (result) {
    return result
  }

  result = await singleton.wreck.get(url, props || {})
  if (Buffer.isBuffer(result)) {
    result = result.toString()
  }
  // courtesy of https://stackoverflow.com/questions/822452/strip-html-from-text-javascript#822464
  if (result.indexOf('<html>') !== -1) {
    throw new Error(result.replace(/<(?:.|\n)*?>/gm, ''))
  }

  result = JSON.parse(result)
  const { error } = schema ? Joi.validate(result, schema) : {}
  if (error) {
    this.captureException(error, {
      extra: {
        data: result
      }
    })
    throw new Error(error)
  }

  singleton.cache.set('url:' + url, result)
  return result
}

// const schemaCMC =
//       Joi.object().keys({
//         symbol: Joi.string().regex(/^[A-Z]{3}$/).required(),
//         price_btc: Joi.number().positive().required(),
//         price_usd: Joi.number().positive().required()
//       }).unknown(true).required()

async function dial911(config) {
  const fiat = 'USD'
  let entries
  const singleton = this

  try {
    entries = await this.retrieve('https://api.coinmarketcap.com/v1/ticker/?convert=' + fiat)
  } catch (ex) {
    return this.captureException('dial911 ticker error: ' + fiat + ': ' + ex.message)
  }
  entries.forEach((entry) => {
    const {
      src: symbol,
      id
    } = entry
    const { error } = Joi.validate(entry, schemas.coinmarketcap)
    const { altcoins } = singleton
    const altcoin = altcoins[src]
    if (error || !singleton.allcoinsHas(src) || !altcoin || altcoin.id !== id) {
      return
    }

    console.log('processing ' + JSON.stringify(entry, null, 2))
    _.keys(entry).forEach((key) => {
      const dst = key.substr(6).toUpperCase()

      if (src === dst || key.substr(0, 6) !== 'price_') {
        return
      }

      singleton.altrate(src, dst, entry[key])
    })
  })
}

function deepRatio(deepObject, a, b, value) {
  let base = deepObject[a]
  if (!base) {
    base = {}
    deepObject[a] = base
  }
  if (_.isUndefined(value)) {
    return base[b]
  }
  base[b] = value
}

function altrate(src, dst, value) {
  return deepRatioSetGet(this.altrates, src, dst, value)
}

function deepRatioSetGet(object, src, dst, value) {
  if (_.isUndefined(value)) {
    return deepRatio(object, src, dst)
  }
  deepRatio(object, src, dst, value)
  deepRatio(object, dst, src, 1 / value)
}

async function inkblot() {
  const context = this
  const { config } = context
  const unavailable = []
  let tickers = {}

  for (let i = fiats.length - 1; i >= 0; i--) {
    let fiat = fiats[i]

    if ((fiat !== 'USD' || fiats.length === 1) && (!tickers[fiat])) {
      await ticker(fiat)
    }
  }
  fiats.forEach((fiat) => {
    if (!tickers[fiat]) {
      unavailable.push(fiat)
    }
  })
  if (unavailable.length > 0) {
    throw new Error('fiats ' + unavailable.join(', ') + ' unavailable')
  }

  return context.normalize(tickers, config, runtime)

  async function ticker(fiat) {
    let entries

    try {
      entries = await retrieve('https://api.coinmarketcap.com/v1/ticker/?convert=' + fiat)
    } catch (ex) {
      ex.message = fiat + ': ' + ex.message
      throw ex
    }
    entries.forEach((entry) => {
      const src = entry.symbol
      const { error } = Joi.validate(entry, schemas.coinmarketcap)

      if (config.allcoins.indexOf(src) === -1) return

      if (!globalAltcoinConfig[src]) {
        return context.captureException('monitor ticker error: no entry for altcoins[' + src + ']')
      }

      if (globalAltcoinConfig[src].id !== entry.id) {
        return
      }

      if (error) {
        return context.captureException('monitor ticker error: ' + error, {
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

        if (!tickers[src]) tickers[src] = {}
        tickers[src][dst] = entry[key]

        if (!tickers[dst]) tickers[dst] = {}
        tickers[dst][src] = 1.0 / entry[key]
      })
    })
  }

}

async function rorschach(rates, tickers) {
  let informP, now
  const context = this
  const { config } = context

  const compare = (currency, fiat, rate1, rate2) => {
    const ratio = rate1 / rate2

    if ((ratio >= 0.9) && (ratio <= 1.1)) {
      return
    }

    debug('rorschach', {
      altcoin: currency,
      fiat: fiat,
      rate1: rate1,
      rate2: rate2
    })
    throw new Error(currency + ' error: ' + fiat + ' ' + rate1 + ' vs. ' + rate2)
  }

  rates = context.normalize(rates, config)

  fiats.forEach((fiat) => {
    config.altcoins.forEach((altcoin) => {
      if (rates[altcoin][fiat]) {
        compare(altcoin, fiat, rates[altcoin][fiat], tickers[altcoin][fiat])
      }
    })
  })

  context.tickers = tickers

  now = _.now()
  informP = context.informs <= now
  config.altcoins.forEach((currency) => {
    const rate = context.rates[currency] || {}

    context.rates[currency] = _.extend(_.clone(rate), rates[currency] || {})
    if ((informP) && (!_.isEqual(context.rates[currency], rate))) {
      debug(currency + ' fiat rates', JSON.stringify(_.pick(context.rates[currency], fiats)))
    }
  })
  if (informP) context.informs = now + (1 * time.minute)

  context.rates = context.normalize(context.rates, config)
  Currency.prototype.rates = context.rates
}

function normalize(rates, config, runtime) {
  const singleton = this
  const tickers = singleton.tickers

  config.allcoins.forEach((currency) => {
    if (!rates[currency]) rates[currency] = {}
  })

  _.keys(rates).forEach((src) => {
    if (config.altcoins.indexOf(src) === -1) {
      return
    }

    _.keys(tickers).forEach((dst) => {
      if (src === dst) {
        return
      }

      _.keys(rates[src]).forEach((rate) => {
        if (rates[src][dst]) {
          return
        }

        if (rates[dst][src]) {
          rates[src][dst] = 1.0 / rates[dst][src]
          return
        }

        if ((!tickers[rate]) || (!tickers[rate][dst]) || (!rates[src]) || (!rates[src][rate])) {
          return
        }

        rates[src][dst] = tickers[rate][dst] * rates[src][rate]
        rates[dst][src] = 1.0 / rates[src][dst]
      })
    })
  })

  config.allcoins.forEach((src) => {
    config.allcoins.forEach((dst) => {
      if ((src === dst) || (rates[src][dst])) {
        return
      }

      _.keys(tickers).forEach((currency) => {
        if (rates[src][dst]) {
          return
        }

        if (rates[dst][src]) {
          rates[src][dst] = 1.0 / rates[dst][src]
          return
        }

        if ((!tickers[currency]) || (!tickers[currency][dst]) || (!rates[src]) || (!rates[src][currency])) {
          return
        }

        rates[src][dst] = tickers[currency][dst] * rates[src][currency]
        rates[dst][src] = 1.0 / rates[src][dst]
      })
    })
  })
  rates = singleton.currencyToNumber(rates)
  return _.omit(rates, fiats)
}

function fiatP(currency) {
  const entry = currencyCodes.code(currency)

  return Array.isArray(entry && entry.countries)
}

// satoshis, wei, etc.
function alt2scale(altcurrency) {
  const scale = decimals[altcurrency]

  if (scale) {
    return '1e' + scale
  }
}

function alt2fiat(altcurrency, probi, currency, floatP) {
  const singleton = this
  const entry = currencyCodes.code(currency)
  const rate = singleton.rates[altcurrency] && singleton.rates[altcurrency][currency]
  const scale = alt2scale(altcurrency)
  let amount

  if (!rate) return

  if (!(probi instanceof BigNumber)) probi = new BigNumber(probi.toString())
  amount = probi.times(new BigNumber(rate.toString()))
  if (floatP) return amount

  if (scale) amount = amount.dividedBy(scale)

  return amount.toFixed(entry ? entry.digits : 2)
}

function fiat2alt(currency, amount, altcurrency) {
  const singleton = this
  const rate = singleton.rates[altcurrency] && singleton.rates[altcurrency][currency]
  const scale = alt2scale(altcurrency)
  let probi

  if ((!amount) || (!rate)) return

  if (!(amount instanceof BigNumber)) amount = new BigNumber(amount.toString())
  probi = amount.dividedBy(new BigNumber(rate.toString()))

  if (scale) probi = probi.times(scale)

  return probi.floor().toString()
}
