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
  const rates = currency.rates()
  t.true(_.isObject(rates))
})

test('rates are relative to passed base', async (t) => {
  t.plan(1)
  await currency.ready()
  const rates = currency.rates(USD)
  t.notDeepEqual(rates, currency.rates(EUR))
})

test('ratio rates', async (t) => {
  t.plan(4)
  await currency.ready()
  const eur = currency.fiat(EUR)
  const zar = currency.fiat(ZAR)
  const bat = currency.alt(BAT)
  const eth = currency.alt(ETH)
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

test('usd can be converted into eur', async (t) => {
  t.plan(1)
  await currency.ready()
  const eur = currency.fiat(EUR)
  const base = currency.base()
  debug(`BASE: ${base}`)
  t.is(+currency.ratio(base, EUR), +eur)
})

test('has checks whether the ratio is available', async (t) => {
  t.plan(2)
  t.false(currency.has(EUR))
  await currency.ready()
  t.true(currency.has(EUR))
})

test('fiat checks whether the ratio is available as a fiat', async (t) => {
  t.plan(2)
  t.is(currency.fiat(EUR), null)
  await currency.ready()
  t.true(currency.fiat(EUR) > 0)
})
test('alt checks whether the ratio is available as an alt', async (t) => {
  t.plan(2)
  t.is(currency.alt(BAT), null)
  await currency.ready()
  t.true(currency.alt(BAT) > 0)
})
test('btc is the same on both fiat and alt', async (t) => {
  t.plan(1)
  await currency.ready()
  t.is(+currency.fiat(BTC), +currency.alt(BTC))
})
test('alt aliases are listed', async (t) => {
  t.plan(1)
  await currency.ready()
  t.is(+currency.ratio('BCH', 'BCC'), 1)
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
