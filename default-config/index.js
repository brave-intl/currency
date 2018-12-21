// required when used as a package
const {
  CURRENCY_BINANCE_KEY,
  CURRENCY_BINANCE_SECRET,
  CURRENCY_RATES_URL,
  CURRENCY_RATES_TOKEN,
  CURRENCY_OXR_API_ID
} = require('../env')

module.exports = {
  rates: {
    url: CURRENCY_RATES_URL,
    access_token: CURRENCY_RATES_TOKEN
  },
  binance: {
    APIKEY: CURRENCY_BINANCE_KEY,
    APISECRET: CURRENCY_BINANCE_SECRET
  },
  oxr: {
    appId: CURRENCY_OXR_API_ID
  }
}
