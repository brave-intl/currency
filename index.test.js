import test from 'ava'
import Currency from './'
import _ from 'underscore'

const BTC = 'BTC'
const USD = 'USD'

test('exports function', (t) => {
  t.true(_.isFunction(Currency))
})

const currency = Currency({
  rates: null
})

test('creates a new Currency object even without the new keyword', (t) => {
  t.plan(2)
  t.true(currency instanceof Currency)
  t.is(Currency.name, 'Currency')
})

test('resolves maintain', async (t) => {
  const currency = Currency({
    rates: null,
    instance: true
  })
  await currency.ready()
  const aggregated = currency.aggregated()
  t.true(_.isObject(aggregated))
  console.log(JSON.stringify(aggregated, null, 2))
})

test('has an altrate fn to access and set altrates', (t) => {
  t.plan(3)
  const value = 5

  t.is(currency.altrate(BTC, USD), undefined)
  // munge altrate
  currency.altrate(BTC, USD, value)
  t.is(currency.altrate(BTC, USD), value)
  t.is(currency.altrate(USD, BTC), Currency.inverse(value))
})

test('has an rate fn to access and set rates', (t) => {
  t.plan(3)
  const value = 10
  const inverse = Currency.inverse(value)

  t.is(currency.rate(BTC, USD), undefined)
  // munge rate
  currency.rate(BTC, USD, value)
  t.is(currency.rate(BTC, USD), value)
  t.is(currency.rate(USD, BTC), inverse)
})
