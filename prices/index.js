const _ = require('lodash')
const oxrModule = require('oxr')
const ScopedBigNumber = require('../big-number')
const _wantedPairs = require('./pairs')
const _altAliases = require('./aliases')
module.exports = prices

function prices ({
  oxr: oxrConfig
}, beItResolved, BigNumber = ScopedBigNumber) {
  if (!oxrConfig) {
    return () => Promise.reject(new Error('missing oxr config'))
  }

  const pairs = oxrConfig.pairs || _wantedPairs
  const altAliases = oxrConfig.aliases || _altAliases

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
      oxr: service,
      pairs
    }, options).then(({
      converted,
      fiat: oxred,
      alt: alts
    }) => {
      const alt = converted ? alts : bigAlts(BigNumber, oxred, alts)
      _.forOwn(altAliases, (values, key) => {
        const val = alt[key]
        if (!val) {
          return
        }
        _.forEach(values, (value) => {
          alt[value] = val
        })
      })
      const fiat = bigOXR(BigNumber, oxred)
      return {
        fiat,
        alt
      }
    })
  }
}

function bigOXR (BigNumber, oxr) {
  return _.mapValues(oxr, (value) => {
    return new BigNumber(value)
  })
}

function bigAlts (BigNumber, fiat, alts) {
  return _.mapValues(alts, (value) => {
    const btc = new BigNumber(fiat.BTC)
    const ratio = btc.dividedBy(alts.BTC)
    const alt = new BigNumber(value)
    return alt.times(ratio)
  })
}
