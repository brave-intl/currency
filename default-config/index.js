// required when used as a package
const {
  CURRENCY_BINANCE_KEY,
  CURRENCY_BINANCE_SECRET,
  CURRENCY_OXR_API_ID
} = require('../env')

module.exports = {
  binance: {
    APIKEY: CURRENCY_BINANCE_KEY,
    APISECRET: CURRENCY_BINANCE_SECRET
  },
  oxr: {
    appId: CURRENCY_OXR_API_ID
  }
}
