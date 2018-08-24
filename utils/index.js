const _ = require('lodash')
module.exports = {
  jsonClone,
  captureException,
  inverse,
  toNumber
}

function jsonClone (object) {
  if (!_.isObject(object)) {
    return {}
  }
  return JSON.parse(JSON.stringify(object))
}

function captureException (error) {
  console.log(...arguments)
  return error
}

function inverse (value) {
  return 1 / value
}

function toNumber (value) {
  return +value
}
