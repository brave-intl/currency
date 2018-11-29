import test from 'ava'
import Currency from './'
import _ from 'lodash'
import debug from './debug'

const BAT = 'BAT'
const EUR = 'EUR'
const ZAR = 'ZAR'
const EOS = 'EOS'

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
  const rates = currency.rates('USD')
  t.notDeepEqual(rates, currency.rates('EUR'))
})

test('ratio rates', async (t) => {
  t.plan(4)
  await currency.ready()
  const eur = currency.fiat(EUR)
  const zar = currency.fiat(ZAR)
  const bat = currency.alt(BAT)
  const eos = currency.alt(EOS)
  const eurBatRatio = bat.dividedBy(eur)
  const eurZarRatio = zar.dividedBy(eur)
  const eosBatRatio = bat.dividedBy(eos)
  const eosZarRatio = zar.dividedBy(eos)
  t.is(+currency.ratio(EUR, BAT), +eurBatRatio)
  t.is(+currency.ratio(EUR, ZAR), +eurZarRatio)
  t.is(+currency.ratio(EOS, BAT), +eosBatRatio)
  t.is(+currency.ratio(EOS, ZAR), +eosZarRatio)
  debug(`
  from USD
  ${EUR} ${+eur}
  ${BAT} ${+bat}
  ${ZAR} ${+zar}
  ${EOS} ${+eos}

  convert
  with 1 ${EUR} you can buy this many ${BAT}: ${+eurBatRatio}
  with 1 ${EUR} you can buy this many ${ZAR}: ${+eurZarRatio}
  with 1 ${EOS} you can buy this many ${BAT}: ${+eosBatRatio}
  with 1 ${EOS} you can buy this many ${ZAR}: ${+eosZarRatio}
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
  t.is(currency.base(), 'USD')
})

test('usd can be converted into usdt', async (t) => {
  t.plan(1)
  await currency.ready()
  const usdt = currency.alt('USDT')
  const base = currency.base()
  debug(`BASE: ${base}`)
  debug(`USDT: ${usdt}`)
  t.is(+currency.ratio(base, 'USDT'), +usdt)
})

test('has checks whether the ratio is available', async (t) => {
  t.plan(2)
  t.false(currency.has('USDT'))
  await currency.ready()
  t.true(currency.has('USDT'))
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
  t.is(+currency.fiat('BTC'), +currency.alt('BTC'))
})
test('alt aliases are listed', async (t) => {
  t.plan(1)
  await currency.ready()
  t.is(+currency.ratio('BCH', 'BCC'), 1)
})
