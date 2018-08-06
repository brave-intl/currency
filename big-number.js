const BigNumber = require('bignumber.js')
const ScopedBigNumber = BigNumber.clone()
ScopedBigNumber.config({
  EXPONENTIAL_AT: 28,
  DECIMAL_PLACES: 18
})
module.exports = ScopedBigNumber
