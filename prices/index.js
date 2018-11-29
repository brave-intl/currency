const _ = require('lodash')
const oxr = require('oxr')
const time = require('../time')
const split = require('../split')
const binance = require('../binance')
const ScopedBigNumber = require('../big-number')
const _wantedPairs = require('./pairs')
const _altAliases = require('./aliases')

module.exports = prices

function prices (config, BigNumber = ScopedBigNumber) {
  if (!config) {
    return Promise.reject
  }

  const wantedPairs = config.pairs || _wantedPairs
  const altAliases = config.aliases || _altAliases
  const exchangeRoot = config.root || 'PAX'
  const altRoot = config.altRoot || 'BTC'

  let cacheTTL = parseInt(config.cacheTTL, 10)

  if (isNaN(cacheTTL) || (cacheTTL < 1)) {
    cacheTTL = time.WEEK
  }

  const factory = oxr.factory({
    appId: config.apiID
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

  const instance = oxr.cache(options, factory)

  return () => Promise.all([
    instance.latest(),
    fetchPrices(wantedPairs).then((pairs) => {
      return _.pick(pairs, wantedPairs)
    })
  ]).then((results) => {
    const oxr = results[0]
    const alts = results[1]
    const { rates } = oxr
    const baseline = rates[altRoot]
    const one = new BigNumber(1)
    const BASEROOT = `${altRoot}${exchangeRoot}`
    const basestable = new BigNumber(alts[BASEROOT])
    const BinanceUSDSTABLE = one.dividedBy(basestable.times(baseline))
    alts[BASEROOT] = basestable.times(BinanceUSDSTABLE)
    const baselined = bigAlts(exchangeRoot, BigNumber, alts)
    baselined.USDT = BinanceUSDSTABLE
    _.forOwn(altAliases, (values, key) => {
      const val = baselined[key]
      if (!val) {
        return
      }
      _.forEach(values, (value) => {
        baselined[value] = val
      })
    })
    const oxred = bigOXR(BigNumber, rates)
    return {
      fiat: oxred,
      alt: baselined
    }
  })
}

function bigOXR (BigNumber, oxr) {
  return _.mapValues(oxr, (value) => {
    return new BigNumber(value)
  })
}

function bigAlts (exchangeRoot, BigNumber, alts) {
  const keys = _.keys(alts)
  const one = new BigNumber(1)
  return _.reduce(keys, (memo, _key) => {
    let key = _key
    const value_ = alts[key]
    let value = new BigNumber(value_)
    const [src, dest] = split(key)
    if (dest !== exchangeRoot) {
      let key = `${dest}${exchangeRoot}`
      let reverseKey = `${exchangeRoot}${dest}`
      const altVal = alts[key] || alts[reverseKey]
      const altBaseRatio = new BigNumber(altVal)
      value = altBaseRatio.times(value)
    }
    memo[src] = one.dividedBy(value)
    return memo
  }, {})
}

function fetchPrices () {
  return new Promise((resolve, reject) => {
    binance.prices((error, prices) => {
      if (error) {
        return reject(error)
      }
      resolve(prices)
    })
  })
}
