const dotenv = require('dotenv')
dotenv.config()

const {
  CURRENCY_OXR_API_ID,
  NODE_ENV
} = process.env

module.exports = {
  CURRENCY_OXR_API_ID,
  NODE_ENV
}
