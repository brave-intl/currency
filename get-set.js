const {
  isUndefined
} = require('underscore')
const {
  inverse,
  toNumber
} = require('./utils')
module.exports = deepGetSet
deepGetSet.accessor = deepAccessor

function deepGetSet (object, src, dst, value) {
  if (isUndefined(value)) {
    return deepAccessor(object, src, dst)
  }
  deepAccessor(object, src, dst, value)
  deepAccessor(object, dst, src, inverse(value))
}

function deepAccessor (deepObject, a, b, value) {
  let base = deepObject[a]
  if (!base) {
    base = {}
    deepObject[a] = base
  }
  if (isUndefined(b)) {
    return base
  }
  if (isUndefined(value)) {
    return base[b]
  }
  base[b] = toNumber(value)
}
