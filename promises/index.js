module.exports = {
  breaker,
  maker
}

function breaker (key, getCache) {
  return function () {
    const cache = getCache(this, ...arguments)
    cache.del(key)
    return this[key](...arguments)
  }
}

function maker (key, getCache, fn) {
  return function () {
    const cache = getCache(this, ...arguments)
    let value = cache.get(key)
    if (!value) {
      value = Promise.resolve(fn.apply(this, arguments))
      value = value.catch(clear)
      cache.set(key, value)
    }
    return value

    function clear (e) {
      if (cache.get(key) === value) {
        cache.del(key)
      }
      throw e
    }
  }
}
