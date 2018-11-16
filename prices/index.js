const _ = require('lodash')
const oxr = require('oxr')
const time = require('../time')
const split = require('../split')
const binance = require('../binance')
const ScopedBigNumber = require('../big-number')

const altRoot = 'USDT'

const altAliases = {
  BCHABC: ['BCH', 'BCC']
}

module.exports = prices

function prices (config, BigNumber = ScopedBigNumber) {
  if (!config) {
    return Promise.reject
  }

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
    fetchPrices()
  ]).then(results => {
    const [oxr, alts] = results
    const { rates } = oxr
    const baseline = rates.BTC
    const one = new BigNumber(1)
    const btcusdt = new BigNumber(alts.BTCUSDT)
    const BinanceUSDUSDT = one.dividedBy(btcusdt.times(baseline))
    alts.BTCUSDT = btcusdt.times(BinanceUSDUSDT)
    const baselined = bigAlts(BigNumber, alts)
    baselined.USDT = BinanceUSDUSDT
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

function bigAlts (BigNumber, alts) {
  const keys = _.keys(alts)
  const one = new BigNumber(1)
  return _.reduce(keys, (memo, _key) => {
    let key = _key
    const value_ = alts[key]
    let value = new BigNumber(value_)
    const [src, dest] = split(key)
    if (dest !== altRoot) {
      let key = `${dest}${altRoot}`
      let reverseKey = `${altRoot}${dest}`
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
