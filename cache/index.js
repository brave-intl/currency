const globalCache = {}
module.exports = Cache

function Cache () {}

Cache.prototype = {
  get: function (key) {
    const value = globalCache[key]
    if (!value) {
      return value
    }
    return JSON.parse(value)
  },
  set: function (key, value) {
    globalCache[key] = JSON.stringify(value)
  }
}

Cache.keys = {
  fiats: (altcoin) => `fiats:${altcoin}`,
  url: (url) => `url:${url}`,
  ticker: (altcoin, fiat) => {
    return fiat ? `ticker:${altcoin}${fiat}` : `ticker:${altcoin}`
  }
}
