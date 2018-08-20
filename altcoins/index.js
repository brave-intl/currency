const _ = require('lodash')
const {
  keys: cacheKeys
} = require('../cache')
const time = require('../time')

const globalAltcoinConfig = {
  _internal: {
    f: internalFn
  },
  call: callMethod,
  has: hasMethod,
  currencies: {
    BAT: {
      id: 'basic-attention-token'
    },

    BTC: defaultConfig('BTC', 'bitcoin'),
    ETH: defaultConfig('ETH', 'ethereum'),
    LTC: defaultConfig('LTC', 'litecoin')
  }
}

module.exports = globalAltcoinConfig

function hasMethod (currency, id) {
  const config = this.currencies[currency]
  const exists = !!config
  if (_.isUndefined(id)) {
    return exists
  }
  return exists && config.id === id
}

function callMethod (currency, method, args) {
  const setup = this.currencies[currency]
  if (!setup) {
    return
  }

  const {
    [method]: fn
  } = setup
  if (!fn) {
    return
  }

  return fn.apply(null, args)
}

function defaultConfig (ticker, id, options) {
  return _.assign({
    id,

    f: async (tickers, context) => {
      return globalAltcoinConfig._internal.f(ticker, tickers, context)
    }
  }, options)
}

async function internalFn (altcoin, tickers, context) {
  const {
    cache
  } = context
  const fiats = cache.get(cacheKeys(altcoin))

  if (!fiats) {
    return
  }

  const fiatGetter = getFiatRate(cache, altcoin)

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

  const target = {
    [altcoin]: rates
  }
  await context.wraptry(() => {
    return context.rorschach(target, tickers)
  }, (ex) => {
    let now = _.now()
    if (context.warnings > now) {
      return
    }

    const warnings = now + (15 * time.MINUTE)
    context.warnings = warnings
  })
}

function getFiatRate (cache, altcoin) {
  return (memo, fiat) => {
    const key = cacheKeys.ticker(altcoin, fiat)
    const {
      rates,
      unavailable
    } = memo
    const rate = cache.get(key)
    if (rate && rate.last) {
      rates[fiat] = rate.last
    } else {
      unavailable.push(fiat)
    }
    return memo
  }
}
