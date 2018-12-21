const _ = require('lodash')
const oxrModule = require('oxr')
const split = require('../split')
const Binance = require('../binance')
const ScopedBigNumber = require('../big-number')
const _wantedPairs = require('./pairs')
const _altAliases = require('./aliases')
module.exports = prices

function prices ({
  oxr: oxrConfig,
  binance: binanceConfig
}, beItResolved, BigNumber = ScopedBigNumber) {
  if (!oxrConfig || !binanceConfig) {
    return Promise.reject
  }

  const pairs = oxrConfig.pairs || _wantedPairs
  const altAliases = oxrConfig.aliases || _altAliases
  const exchangeRoot = oxrConfig.root || 'USDT'
  const altRoot = oxrConfig.altRoot || 'BTC'

  const binance = Binance(binanceConfig)
  let service = null
  service = oxrModule.factory(oxrConfig)
  service = oxrModule.cache({
    method: 'historical',
    store: {
      cache: {},
      get: function (date) {
        return Promise.resolve(this.cache[date])
      },
      put: function (value, date) {
        this.cache[date] = value
        return Promise.resolve(this.cache[date])
      }
    }
  }, service)

  return function (options) {
    return beItResolved.call(this, {
      binance,
      oxr: service,
      pairs
    }, options).then(({
      converted,
      fiat,
      alt
    }) => {
      let baselined = null
      if (converted) {
        baselined = alt
      } else {
        baselined = bigAlts(fiat[altRoot], altRoot, exchangeRoot, BigNumber, alt)
      }
      _.forOwn(altAliases, (values, key) => {
        const val = baselined[key]
        if (!val) {
          return
        }
        _.forEach(values, (value) => {
          baselined[value] = val
        })
      })
      const oxred = bigOXR(BigNumber, fiat)
      return {
        fiat: oxred,
        alt: baselined
      }
    })
  }
}

function key (a, b) {
  return `${a}${b}`
}

function bigOXR (BigNumber, oxr) {
  return _.mapValues(oxr, (value) => {
    return new BigNumber(value)
  })
}

function bigAlts (usd, altRoot, exchangeRoot, BigNumber, alts) {
  const keys = _.keys(alts)
  const conversionKey = key(altRoot, exchangeRoot)
  const convertValue = alts[conversionKey]
  const bigConvert = new BigNumber(convertValue)
  const bigUSD = new BigNumber(usd)
  const ratio = bigConvert.times(bigUSD)
  return _.reduce(keys, (memo, _key) => {
    let key = _key
    const value_ = alts[key]
    let value = new BigNumber(value_)
    const apart = split(key)
    const src = apart[0]
    const dest = apart[1]
    if (dest !== exchangeRoot) {
      let key = `${dest}${exchangeRoot}`
      let reverseKey = `${exchangeRoot}${dest}`
      const altVal = alts[key] || alts[reverseKey]
      const altBaseRatio = new BigNumber(altVal)
      value = altBaseRatio.times(value)
    }
    if (src && src !== altRoot) {
      memo[src] = ratio.dividedBy(value)
    }
    return memo
  }, {
    BTC: bigUSD,
    USDT: ratio
  })
}
