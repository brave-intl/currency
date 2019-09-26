// required when used as a package
const {
  CURRENCY_OXR_API_ID
} = require('../env')

module.exports = {
  maxWait: 3000,
  oxr: {
    appId: CURRENCY_OXR_API_ID
  }
}
