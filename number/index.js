const currencyCodes = require('currency-codes')
const decimals = require('../decimals')

module.exports = {
  alt: {
    scale: alt2scale,
    fiat: alt2fiat
  },
  fiat: {
    alt: fiat2alt
  }
}

// satoshis, wei, etc.
function alt2scale (altcurrency) {
  const scale = decimals[altcurrency]

  if (scale) {
    return `1e${scale}`
  }
}

function alt2fiat (BigNumber, altcurrency, probi_, currency, float, rate_) {
  const entry = currencyCodes.code(currency)
  const scale = alt2scale(altcurrency)
  let rate = rate_
  let probi = probi_
  let amount

  if (!rate) {
    return
  }

  probi = new BigNumber(probi.toString())

  rate = new BigNumber(rate.toString())
  amount = probi.times(rate)
  if (float) {
    return amount
  }

  if (scale) {
    amount = amount.dividedBy(scale)
  }

  const decimals = entry ? entry.digits : 2
  return amount.toFixed(decimals)
}

function fiat2alt (BigNumber, currency, amount_, altcurrency, rate) {
  const scale = alt2scale(altcurrency)
  let probi
  let amount = amount_

  if (!amount || !rate) {
    return
  }

  amount = new BigNumber(amount.toString())
  probi = amount.dividedBy(new BigNumber(rate.toString()))

  if (scale) {
    probi = probi.times(scale)
  }

  return probi.floor().toString()
}
