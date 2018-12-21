const dotenv = require('dotenv')
dotenv.config()

const {
  CURRENCY_BINANCE_KEY,
  CURRENCY_BINANCE_SECRET,
  CURRENCY_RATES_TOKEN,
  CURRENCY_RATES_URL,
  CURRENCY_OXR_API_ID,
  NODE_ENV
} = process.env

module.exports = {
  CURRENCY_BINANCE_KEY,
  CURRENCY_BINANCE_SECRET,
  CURRENCY_RATES_TOKEN,
  CURRENCY_RATES_URL,
  CURRENCY_OXR_API_ID,
  NODE_ENV
}
