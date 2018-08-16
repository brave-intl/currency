const WebSocket = require('faye-websocket')
const oxr = require('oxr')
const _ = require('underscore')
const globalAltcoinConfig = require('../altcoins')
const time = require('../time')
const schemas = require('../schemas')
const binance = require('../binance')
const debug = require('../debug')
const {
  keys: cacheKeys
} = require('../cache')
const {
  addBaselineSymbols
} = require('../utils')

module.exports = [
  monitor1,
  monitor2,
  monitor3
]

function monitor1 (context) {
  const { config } = context
  const symbols = config.altcoins.reduce(addBaselineSymbols, [])

  return monitor1a(symbols, false, context)
}

async function monitor1a (symbols, retry, context) {
  if (retry) {
    debug('monitor1', {
      symbols,
      retry
    })
  }

  const tradeSchema = schemas.binance
  let finished = false
  return new Promise((resolve, reject) => {
    binance.websockets.trades(symbols, (trade) => {
      const error = context.captureValidation('trade', trade, tradeSchema)
      if (error) {
        return
      }
      update(trade.s, trade.p)
      respond(symbols, resolve)
    })
    binance.prices(symbols, (error, prices) => {
      if (error) {
        context.captureException(error)
        return
      }
      symbols.forEach((symbol) => {
        update(symbol, prices[symbol])
      })
      respond(symbols, resolve)
    })
  })

  function respond (symbols, resolve) {
    if (finished) {
      return
    }
    // console.log(symbols)
    if (!_.find(symbols, (symbol) => {
      const split = context.splitSymbol(symbol)
      return !context.altrate(...split)
    })) {
      finished = true
      resolve()
    }
  }

  function update (symbol, price) {
    const split = context.splitSymbol(symbol)
    const [
      src,
      dst
    ] = split
    setAltRate(context, src, dst, price)
    return split
  }
}

function setAltRate (context, src, dst, price) {
  if (src === dst || !context.allcoinsHasAny([src, dst])) {
    return
  }
  context.altrate(src, dst, price)
}

function monitor2 (context) {
  let {
    config,
    cache,
    gdax
  } = context

  if (gdax) {
    return
  }

  const query = []
  const symbols = []
  const {
    altcoins,
    urls,
    globalFiats
  } = config

  altcoins.forEach((altcoin) => {
    const eligible = []
    if (!globalAltcoinConfig.has(altcoin) || altcoin === 'BAT') {
      return
    }

    globalFiats.forEach((fiat) => {
      const productID = altcoin + '-' + fiat
      query.push({
        type: 'subscribe',
        product_id: productID
      })
      symbols.push(productID)
      eligible.push(fiat)
    })

    cache.set(`fiats:${altcoin}`, eligible)
  })

  gdax = new WebSocket.Client(urls.gdax)
  context.gdax = gdax

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
      return context.captureException(new Error('no event.data'))
    }

    try {
      data = JSON.parse(data)
    } catch (ex) {
      retry()
      return context.captureException(ex)
    }

    let {
      type,
      price,
      product_id: productID
    } = data

    if (_.isUndefined(type) || _.isUndefined(price)) {
      return
    }

    if (context.captureValidation('data', data, schemas.gdax)) {
      return retry()
    }
    const squishedID = productID.replace('-', '')
    const priceInt = parseFloat(price)

    cache.set(cacheKeys.ticker(squishedID), priceInt)
  })
  context.wraptry(() => {
    query.forEach((symbol) => {
      gdax.send(JSON.stringify(symbol))
    })
  }, retry)

  function retry () {
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

    gdax = null
    setTimeout(() => {
      monitor2(context)
    }, 15 * time.SECOND)
  }
}

function monitor3 (context) {
  const { config } = context
  const { oxr: configOXR } = config

  if (!configOXR) {
    return
  }

  let cacheTTL = parseInt(configOXR.cacheTTL, 10)

  if (isNaN(cacheTTL) || (cacheTTL < 1)) {
    cacheTTL = time.WEEK
  }

  const factory = oxr.factory({
    appId: configOXR.apiID
  })
  const store = {
    get: function () {
      return Promise.resolve(this.value)
    },
    put: function (value) {
      this.value = value
      return Promise.resolve(value)
    }
  }
  const ttl = parseInt(cacheTTL, 10)
  const options = {
    store,
    ttl
  }

  context.oxr = oxr.cache(options, factory)
}
