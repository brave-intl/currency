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
  const aggregated = currency.aggregate()
  t.true(_.isObject(aggregated))
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
  from
  ${EUR}, ${+eur}
  ${BAT}, ${+bat}
  ${ZAR}, ${+zar}
  ${EOS}, ${+eos}
  convert
  ${EUR} ${BAT} ${+eurBatRatio}
  ${EUR} ${ZAR} ${+eurZarRatio}
  ${EOS} ${BAT} ${+eosBatRatio}
  ${EOS} ${ZAR} ${+eosZarRatio}
`)
})

test('last updated', async (t) => {
  t.plan(1)
  t.true(currency.lastUpdated() < _.now())
})
