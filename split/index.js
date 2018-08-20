module.exports = split

const configurations = [{
  USDT: true,
  length: 4
}, {
  BTC: true,
  ETH: true,
  BNB: true,
  length: 3
}]

function split (symbol) {
  const destination = dest(symbol)
  const source = symbol.slice(0, symbol.length - destination.length)
  return [source, destination]
}

function dest (symbol) {
  const symbolLen = symbol.length
  for (let config of configurations) {
    let length = config.length
    let suffix = symbol.slice(symbolLen - length)
    if (config[suffix]) {
      return suffix
    }
  }
}
