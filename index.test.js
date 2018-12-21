import test from 'ava'
import Currency from './'
import _ from 'lodash'
import debug from './debug'
import path from 'path'
import fs from 'fs'

const USD = 'USD'
const BAT = 'BAT'
const EUR = 'EUR'
const ZAR = 'ZAR'
const ETH = 'ETH'
const BTC = 'BTC'
const USDT = 'USDT'
const today = new Date()

test('exports function', (t) => {
  t.true(_.isFunction(Currency))
})

const currency = Currency()

test('creates a new Currency object even without the new keyword', (t) => {
  t.plan(2)
  t.true(currency instanceof Currency)
  t.is(Currency.name, 'Currency')
})

test('resolves maintain', async (t) => {
  t.plan(1)
  await currency.ready()
  const rates = currency.rates(today)
  t.true(_.isObject(rates))
})

test('rates are relative to passed base', async (t) => {
  t.plan(1)
  await currency.ready()
  const rates = currency.rates(today, USD)
  t.notDeepEqual(rates, currency.rates(today, EUR))
})

test('ratio rates', async (t) => {
  t.plan(4)
  await currency.ready()
  const eur = currency.fiat(today, EUR)
  const zar = currency.fiat(today, ZAR)
  const bat = currency.alt(today, BAT)
  const eth = currency.alt(today, ETH)
  const eurBatRatio = bat.dividedBy(eur)
  const eurZarRatio = zar.dividedBy(eur)
  const ethBatRatio = bat.dividedBy(eth)
  const ethZarRatio = zar.dividedBy(eth)
  t.is(+currency.ratio(today, EUR, BAT), +eurBatRatio)
  t.is(+currency.ratio(today, EUR, ZAR), +eurZarRatio)
  t.is(+currency.ratio(today, ETH, BAT), +ethBatRatio)
  t.is(+currency.ratio(today, ETH, ZAR), +ethZarRatio)
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

test('last updated', async (t) => {
  t.plan(2)
  t.is(currency.lastUpdated(), null)
  await currency.ready()
  t.true(new Date(currency.lastUpdated()) < _.now())
})

test('base returns the base of the currency', async (t) => {
  t.plan(1)
  t.is(currency.base(), USD)
})

test('usd can be converted into usdt', async (t) => {
  t.plan(1)
  await currency.ready()
  const usdt = currency.alt(today, USDT)
  const base = currency.base()
  debug(`BASE: ${base}`)
  t.is(+currency.ratio(today, base, USDT), +usdt)
})

test('has checks whether the ratio is available', async (t) => {
  t.plan(2)
  t.false(currency.has(today, USDT))
  await currency.ready()
  t.true(currency.has(today, USDT))
})

test('fiat checks whether the ratio is available as a fiat', async (t) => {
  t.plan(2)
  t.is(currency.fiat(today, EUR), null)
  await currency.ready()
  t.true(currency.fiat(today, EUR) > 0)
})
test('alt checks whether the ratio is available as an alt', async (t) => {
  t.plan(2)
  t.is(currency.alt(today, BAT), null)
  await currency.ready()
  t.true(currency.alt(today, BAT) > 0)
})
test('btc is the same on both fiat and alt', async (t) => {
  t.plan(1)
  await currency.ready()
  t.is(+currency.fiat(today, BTC), +currency.alt(today, BTC))
})
test('alt aliases are listed', async (t) => {
  t.plan(1)
  await currency.ready()
  t.is(+currency.ratio(today, 'BCH', 'BCC'), 1)
})
test('can retrieve date based prices', async (t) => {
  t.plan(1)
  await currency.ready()
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
})
