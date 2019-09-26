const _ = require('lodash')
module.exports = {
  mapBigNumber,
  jsonClone,
  timeout,
  inverse,
  toNumber
}

function jsonClone (object) {
  if (!_.isObject(object)) {
    return {}
  }
  return JSON.parse(JSON.stringify(object))
}

function inverse (value) {
  return 1 / value
}

function toNumber (value) {
  return +value
}

function timeout (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mapBigNumber (BigNumber, hash) {
  return _.mapValues(hash, (value) => {
    return new BigNumber(value)
  })
}
