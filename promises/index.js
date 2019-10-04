module.exports = {
  breaker,
  maker
}

function breaker (key, getCache) {
  return function () {
    const cache = getCache(this, ...arguments)
    delete cache[key]
    return this[key](...arguments)
  }
}

function maker (key, getCache, fn) {
  return function () {
    const cache = getCache(this, ...arguments)
    let value = cache[key]
    if (!value) {
      value = Promise.resolve(fn.apply(this, arguments))
      value = value.catch(clear)
      cache[key] = value
    }
    return value

    function clear (e) {
      if (cache[key] === value) {
        delete cache[key]
      }
      throw e
    }
  }
}
