import test from 'ava'
import Currency from './'
import _ from 'underscore'

test('exports function', (t) => {
  t.true(_.isFunction(Currency))
})

test('creates a new Currency object even without the new keyword', (t) => {
  const currency = Currency()
  t.true(currency instanceof Currency)
  t.is(Currency.name, 'Currency')
})
