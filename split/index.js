module.exports = split

const configurations = [{
  USDT: true,
  TUSD: true,
  USDC: true,
  length: 4
}, {
  BTC: true,
  ETH: true,
  BNB: true,
  PAX: true,
  XRP: true,
  length: 3
}]

function split (symbol) {
  const destination = dest(symbol)
  const symbolLen = symbol && symbol.length
  const destinationLen = destination && destination.length
  if (!symbolLen || !destinationLen) {
    return []
  }
  const source = symbol.slice(0, symbolLen - destinationLen)
  return [source, destination]
}

function dest (symbol) {
  const symbolLen = symbol.length
  for (const config of configurations) {
    const length = config.length
    const suffix = symbol.slice(symbolLen - length)
    if (config[suffix]) {
      return suffix
    }
  }
}
