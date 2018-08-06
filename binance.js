const Binance = require('node-binance-api')
const instance = new Binance()
// instance.options({
//   // reconnect: true,
//   // verbose: true
// })
module.exports = instance
