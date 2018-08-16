module.exports = (Constructor, ...args) => {
  let instance = null
  return globl

  function globl () {
    if (!instance) {
      instance = new Constructor(...args)
    }
    return instance
  }
}
