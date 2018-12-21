const Binance = require('node-binance-api')
module.exports = create

function create (options) {
  const binance = new Binance()
  binance.options(options)
  return binance
}
