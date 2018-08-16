// required when used as a package
const {
  CURRENCY_RATES_URL,
  CURRENCY_RATES_TOKEN,
  CURRENCY_OXR_API_ID
} = require('../env')

module.exports = {
  globalFiats: ['USD', 'EUR'],
  altcoins: ['BAT', 'ETH'],
  urls: {
    coinmarketcap: 'https://api.coinmarketcap.com/v1/ticker/',
    gdax: 'wss://ws-feed.gdax.com/'
  },
  rates: {
    url: CURRENCY_RATES_URL || 'http://localhost:3004/v1/rates',
    access_token: CURRENCY_RATES_TOKEN || '00000000-0000-4000-0000-000000000000'
  },
  oxr: {
    cacheTTL: 300,
    apiID: CURRENCY_OXR_API_ID
  }
}
