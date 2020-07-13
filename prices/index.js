const _ = require('lodash')
const oxrModule = require('oxr')
const Boom = require('@hapi/boom')
const ScopedBigNumber = require('../big-number')
const _wantedPairs = require('./pairs')
const _altAliases = require('./aliases')
const utils = require('../utils')
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
      fiat: fiats,
      alt: alts
    }) => {
      const errs = [].concat(fiats.errors, alts.errors)
      const errors = errs.map((err) => Boom.boomify(err))
      const fiat = utils.mapBigNumber(BigNumber, fiats.prices)
      const alt = converted ? alts.prices : bigAlts(BigNumber, fiats.prices, alts.prices)
      // alt data sanitation
      _.forOwn(altAliases, (values, key) => {
        const val = alt[key]
        if (!val) {
          return
        }
        _.forEach(values, (value) => {
          alt[value] = val
        })
      })
      const preserve = {
        BTC: true
      }
      _.forOwn(alt, (val, key) => {
        if (fiat[key] && !preserve[key]) {
          delete alt[key]
        }
      })
      return {
        update: true,
        errors,
        stale: fiats.stale || alts.stale || false,
        fiat,
        alt
      }
    })
  }
}

function bigAlts (BigNumber, fiat, alts) {
  const { BTC } = fiat
  const { BTC: altBTC } = alts
  return _.mapValues(alts, (value) => {
    const btc = new BigNumber(BTC || altBTC)
    const ratio = btc.dividedBy(altBTC || BTC)
    const alt = new BigNumber(value)
    return alt.times(ratio)
  })
}
