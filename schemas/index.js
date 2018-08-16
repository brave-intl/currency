const Joi = require('joi')
const regexp = require('../regexp')

const emptyObject = Joi.object().keys({})
const positiveNumber = Joi.number().positive()
const requiredString = Joi.string().required()
const requiredPositiveNumber = positiveNumber.required()

const positiveNumberObject = emptyObject.pattern(regexp.numberWithUnit, positiveNumber)
const nestedPositiveNumberObject = emptyObject.pattern(regexp.numberWithUnit, positiveNumberObject)
const optionalNestedNumbers = nestedPositiveNumberObject.optional()

const altrates = optionalNestedNumbers
const rates = optionalNestedNumbers

const fxrates = Joi.object().keys({
  rates: positiveNumberObject.required()
}).optional().unknown(true)

const currency = Joi.object().keys({
  altrates,
  fxrates,
  rates
}).required()

const gdax = Joi.object().keys({
  type: Joi.any().required(),
  product_id: requiredString.regex(regexp.dashNumberWithUnit),
  price: requiredPositiveNumber
}).required().unknown(true)

const coinmarketcap = Joi.object().keys({
  symbol: requiredString.regex(regexp.symbol),
  price_btc: requiredPositiveNumber,
  price_usd: requiredPositiveNumber
}).required().unknown(true)

const binance = Joi.object().keys({
  e: requiredString,
  s: requiredString.regex(regexp.dualSymbolNumbers),
  p: requiredPositiveNumber
}).required().unknown(true)

module.exports = {
  currency,
  gdax,
  coinmarketcap,
  binance
}
