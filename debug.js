const {
  NODE_ENV
} = require('./env')
const Debug = require('debug')
const debug = new Debug('currency')
debug('environment', NODE_ENV)
module.exports = debug
