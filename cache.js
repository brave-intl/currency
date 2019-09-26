module.exports = Cache

function Cache () {
  return {
    state: {},
    del: function (key) {
      delete this.state[key]
    },
    get: function (key) {
      return this.state[key]
    },
    set: function (key, value) {
      this.state[key] = value
    }
  }
}
