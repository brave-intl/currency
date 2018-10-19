module.exports = {
  breaker,
  maker
}

function breaker (key, getPromises) {
  return function () {
    const promises = getPromises(this)
    delete promises[key]
    return this[key](...arguments)
  }
}

function maker (key, getPromises, fn) {
  return function () {
    const promises = getPromises(this)
    return (promises[key] = (promises[key] || fn.apply(this, arguments)))
  }
}
