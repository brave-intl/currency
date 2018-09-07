const _ = require('lodash')
module.exports = {
  jsonClone,
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
