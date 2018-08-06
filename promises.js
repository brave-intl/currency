module.exports = {
  break: breaker,
  make
}

function breaker (key, method) {
  return function () {
    const context = this
    const { promises } = context
    delete promises[key]
    return this[key](...arguments)
  }
}

function make (key, fn) {
  return function () {
    const context = this
    const { promises } = context
    return (promises[key] = (promises[key] || fn.apply(context, arguments)))
  }
}
