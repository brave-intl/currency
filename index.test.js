import {
  serial as test
} from 'ava'
import Currency from './'
import _ from 'lodash'

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
  await currency.ready()
  const rates = currency.rates()
  t.true(_.isObject(rates))
})

test('ratio rates', async (t) => {
  t.plan(4)
  await currency.ready()
  const eur = currency.fxrate(EUR)
  const zar = currency.fxrate(ZAR)
  const bat = currency.altrate(BAT)
  const eos = currency.altrate(EOS)
  const eurBatRatio = bat.dividedBy(eur)
  const eurZarRatio = zar.dividedBy(eur)
  const eosBatRatio = bat.dividedBy(eos)
  const eosZarRatio = zar.dividedBy(eos)
  t.is(+currency.ratio(EUR, BAT), +eurBatRatio)
  t.is(+currency.ratio(EUR, ZAR), +eurZarRatio)
  t.is(+currency.ratio(EOS, BAT), +eosBatRatio)
  t.is(+currency.ratio(EOS, ZAR), +eosZarRatio)
  console.log(`
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
  t.plan(1)
  t.true(currency.lastUpdated() < _.now())
})
