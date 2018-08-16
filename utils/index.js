const _ = require('underscore')
module.exports = {
  jsonClone,
  captureException,
  inverse,
  toNumber,
  addBaselineSymbols
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
  return 1.0 / value
}

function addBaselineSymbols (symbols, altcoin) {
  if (altcoin === 'BTC') {
    symbols.push('BTCUSDT')
  } else if (altcoin === 'ETH') {
    symbols.push('ETHUSDT', 'ETHBTC')
  } else {
    symbols.push(altcoin.split('-').join('') + 'BTC')
  }
  return symbols
}

function toNumber (value) {
  return +value
}
