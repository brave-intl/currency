// required when used as a package
const {
  CURRENCY_RATES_URL,
  CURRENCY_RATES_TOKEN,
  CURRENCY_OXR_API_ID
} = require('../env')

module.exports = {
  rates: {
    url: CURRENCY_RATES_URL,
    access_token: CURRENCY_RATES_TOKEN
  },
  oxr: {
    cacheTTL: 300,
    apiID: CURRENCY_OXR_API_ID
  }
}
