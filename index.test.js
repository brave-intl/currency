import test from 'ava'
import prices from './prices'
import Currency from './'
import _ from 'lodash'
import debug from './debug'
import path from 'path'
import fs from 'fs'
import createGlobal from './create-global'
import split from './split'
import * as utils from './utils'
import * as promises from './promises'

const USD = 'USD'
const BAT = 'BAT'
const EUR = 'EUR'
const ZAR = 'ZAR'
const ETH = 'ETH'
const BTC = 'BTC'

const currency = Currency()
currency.captureException = _.noop

// must be run first
test.serial('can retrieve date based prices', async (t) => {
  currency.request = async (e) => {
    throw new Error('errs in request')
  }
  t.deepEqual({}, (await currency.prices({})).alt)
  t.deepEqual({}, (await currency.prices({
    date: '2018-12-31'
  })).alt)
  delete currency.request

  await t.throwsAsync(currency.request({
    hostname: 'verified-noexist.com',
    protocol: 'https:',
    path: '/',
    method: 'GET'
  }))

  const prices = await currency.prices({
    date: '2018-12-31'
  })
  const jsonPrices = _.mapValues(prices, (prices) => {
    return _.mapValues(prices, (price) => price.toString())
  })
  const resultsJSON = path.join(__dirname, 'test.json')
  const file = fs.readFileSync(resultsJSON)
  const json = JSON.parse(file.toString())
  t.deepEqual(jsonPrices, json)
  currency.reset()
})
test('exports function', (t) => {
  t.true(_.isFunction(Currency))
})
test('base returns the base of the currency', async (t) => {
  t.is(currency.base(), USD)
})
test('has checks whether the ratio is available', async (t) => {
  t.false(currency.has(EUR))
  await currency.ready()
  t.true(currency.has(EUR))
})
test('creates a new Currency object even without the new keyword', (t) => {
  t.true(currency instanceof Currency)
  t.is(Currency.name, 'Currency')
})
test('resolves maintain', async (t) => {
  await currency.ready()
  const rates = currency.rates()
  t.true(_.isObject(rates))
})
test('rates are relative to passed base', async (t) => {
  await currency.ready()
  const rates = currency.rates(USD)
  t.notDeepEqual(rates, currency.rates(EUR))
  t.is(null, currency.rates('unk'))
})
test('currency.byDay', async (t) => {
  await currency.ready()
  const day = '2019-01-01'
  const byDay = currency.byDay(day)
  t.is(day, byDay)
  t.is(currency.byDay(), (new Date()).toISOString().split('T')[0])
})
test('last updated', async (t) => {
  t.is(currency.lastUpdated(), null)
  await currency.ready()
  t.true(new Date(currency.lastUpdated()) <= _.now())
})
test('keys are sent back', async (t) => {
  await currency.ready()
  t.is('', currency.key(), 'responds with empty string by default')
  t.is('', currency.key('unk'), 'responds with an empty string if unknown')
  t.is('BAT', currency.key('bat'), 'responds with a confirmed value if currency is known')
})
test('currency.watching', async (t) => {
  await currency.ready()
  t.false(currency.watching('USD', 'UNK'), 'is not watching unknown currency')
  t.false(currency.watching('', 'UNK'), 'is not watching unknown currency')
  t.false(currency.watching('BATUSD'), 'is not watching unknown currency')
  t.false(currency.watching('BATUNK'), 'is not watching unknown currency')
  t.false(currency.watching('BATUN'), 'is not watching unknown currency')
  t.false(currency.watching('BATUN', 'UNK'), 'is not watching unknown currency')
})
test('ratio rates', async (t) => {
  await currency.ready()
  const eur = currency.getUnknown(EUR)
  const zar = currency.getUnknown(ZAR)
  const bat = currency.getUnknown(BAT)
  const eth = currency.getUnknown(ETH)
  const eurBatRatio = bat.dividedBy(eur)
  const eurZarRatio = zar.dividedBy(eur)
  const ethBatRatio = bat.dividedBy(eth)
  const ethZarRatio = zar.dividedBy(eth)
  t.is(+currency.ratio(EUR, BAT), +eurBatRatio)
  t.is(+currency.ratio(EUR, ZAR), +eurZarRatio)
  t.is(+currency.ratio(ETH, BAT), +ethBatRatio)
  t.is(+currency.ratio(ETH, ZAR), +ethZarRatio)
  debug(`
  from USD
  ${EUR} ${+eur}
  ${BAT} ${+bat}
  ${ZAR} ${+zar}
  ${ETH} ${+eth}

  convert
  with 1 ${EUR} you can buy this many ${BAT}: ${+eurBatRatio}
  with 1 ${EUR} you can buy this many ${ZAR}: ${+eurZarRatio}
  with 1 ${ETH} you can buy this many ${BAT}: ${+ethBatRatio}
  with 1 ${ETH} you can buy this many ${ZAR}: ${+ethZarRatio}
`)
})
test('usd can be converted into other currencies', async (t) => {
  await currency.ready()
  const eur = currency.fiat(EUR)
  const bat = currency.alt(BAT)
  const base = currency.base()
  debug(`BASE: ${base}`)
  t.is(+currency.ratio(base, EUR), +eur)
  t.is(+currency.ratio(base, BAT), +bat)
  t.is(currency.ratio().toString(), '0')
})
test('currency.ratioFromKnown', async (t) => {
  await currency.ready()
  const price = currency.ratioFromKnown('fiat', USD, 'alt', BAT)
  t.true(_.isString(price.toString()))
  t.true(_.isNumber(+price.toString()))
})
test('currency.ratioFromConverted', async (t) => {
  await currency.ready()
  let zero
  zero = currency.ratioFromConverted('fiat', 'non', 'alt', 'non')
  t.is('0', zero.toString(), 'when currencies are not found they will default to 0')
  zero = currency.ratioFromConverted('fiat', 'non', 'alt', BAT)
  t.is('0', zero.toString(), 'when currencies are not found they will default to 0')
  zero = currency.ratioFromConverted('fiat', USD, 'alt', 'non')
  t.is('0', zero.toString(), 'when currencies are not found they will default to 0')
  const nonZero = currency.ratioFromConverted('fiat', USD, 'alt', BAT)
  t.not('0', nonZero.toString(), 'when currencies are found they should not be 0')
})
test('fiat checks whether the ratio is available as a fiat', async (t) => {
  t.is(currency.fiat(EUR), null)
  await currency.ready()
  t.true(currency.fiat(EUR) > 0)
})
test('alt checks whether the ratio is available as an alt', async (t) => {
  t.is(currency.alt(BAT), null)
  await currency.ready()
  t.true(currency.alt(BAT) > 0)
})
test('btc is the same on both fiat and alt', async (t) => {
  await currency.ready()
  t.is(+currency.fiat(BTC), +currency.alt(BTC))
})
test('alt aliases are listed', async (t) => {
  await currency.ready()
  t.is(+currency.ratio('BCH', 'BCC'), 1)
})
test('has rates from uphold', async (t) => {
  await currency.ready()
  const XAU = await currency.alt('XAU')
  const XAUString = XAU.toString()
  t.true(_.isString(XAUString), 'a string is returned')
  t.true(_.isNumber(+XAUString), 'a number is returned')
})
test('has long rates from uphold', async (t) => {
  await currency.ready()
  const DASH = await currency.alt('DASH')
  const DASHString = DASH.toString()
  t.true(_.isString(DASHString), 'a string is returned')
  t.true(_.isNumber(+DASHString), 'a number is returned')
})
test('check split logic', async (t) => {
  await currency.ready()
  t.deepEqual(split('BCHBTC'), ['BCH', 'BTC'])
  t.deepEqual(split('USDBAT'), [])
})
test('prices', async (t) => {
  const badResolver = prices({})
  await t.throwsAsync(badResolver())
})
test('create global', async (t) => {
  const globl = createGlobal(Construct)
  t.is(globl(), globl())
  t.true(globl() instanceof Construct)

  function Construct () {}
})
test('promises', async (t) => {
  let counter = 0
  const key = 'start'
  const clas = {
    promises: {},
    start: promises.maker(key, getPromises, begin),
    reset: promises.breaker(key, getPromises)
  }
  t.is(0, await clas.start())
  counter += 1
  t.is(0, await clas.start(), 'value is cached')
  t.is(1, await clas.reset(), 'after a reset, value is cached again')

  function getPromises (context) {
    return context.promises
  }

  function begin () {
    return counter
  }
})
test('utils.jsonClone', async (t) => {
  t.deepEqual(utils.jsonClone(), {}, 'an empty object is returned if nothing is passed')
  const a1 = { a: 1 }
  t.deepEqual(utils.jsonClone(a1), a1, 'returns a mimicked structure')
  t.not(utils.jsonClone(a1), a1, 'but they are not the same object')
  a1.b = a1
  t.throws(() => utils.jsonClone(a1), Error, 'a circular object will fail')
})
test('utils.inverse', (t) => {
  t.is(utils.inverse(1), 1)
  t.is(utils.inverse(2), 0.5)
  t.is(utils.inverse(0.5), 2)
})
test('utils.toNumber', (t) => {
  t.is(utils.toNumber(), NaN)
  t.is(utils.toNumber(''), 0)
  t.is(utils.toNumber('4'), 4)
})
