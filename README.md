# @brave-intl/currency

a currency conversion ratio cache

## installation

```sh
npm install --save @brave-intl/currency
```

## testing

```sh
npm install
npm test
```

## instantiation

the following are valid ways to create a new currency instance
```js
const instance1 = new Currency({ /* options */ })
const instance2 = Currency({ /* options */ })
```
the following will get you the global instance to be shared.
```js
const globl = Currency.global()
```

## Options

* instance - (boolean)
* rates - (object)
  * url - (string) url that points to previous instances of the rates endpoint
  * access_token - (string) the access token needed for the above url
* oxr - (object)
  * apiID - (string) oxr app id supplied by registering with oxr
  * cacheTTL - (number) in seconds for the values to stall out and be refetched
* BigNumber - (Constructor) a big-number.js instance that will be used in each ratio computation

## API

### ready
```js
ready() -> promise
```
Returns a promise that resolves when the oxr and binance data have been fetched, or immediately if there are already values.

### update
```js
update() -> promise
```
Forcefully refreshes the prices.

### base
```js
base() -> String
```
returns the base currency against which all others are measured.

### fiat
```js
fiat(currency: String) -> BigNumber
fiat(currency: String) -> null
```
Returns the ratio of the passed fiat currency to the base provided by `open exchange rates`. If the value does not exist (because ready has not finished or because the key is not found) null will be returned.

### alt
```js
alt(currency: String) -> BigNumber
alt(currency: String) -> null
```
Returns the ratio of the passed alt currency to the base provided by `binance`. If the value does not exist (because ready has not finished or because the key is not found) null will be returned.

### ratio
```js
ratio(A: String, B: String) -> BigNumber
ratio(A: String, B: String) -> null
```
Returns the ratio of B over A. An easy way to think about this is how many of, "With `1A`, I can get `xB`s", where x is the result in the form of a `BigNumber` Object. Null is returned if one of the currencies is not

### has
```js
has(currency, String) -> Boolean
```
Checks whether a value exists for the given currency.

### lastUpdated
```js
lastUpdated() -> Number(Date)
```
A Number representing a Date in ms denotes the last time the currencies were fetched. If `0` is returned, then the currencies have not yet finished their first fetching.

### rates
```js
rates(base?: String) -> Object[BigNumber]
rates(base?: String) -> null
```
All altrates and fiatrates in one object with the values as BigNumber(s). Null is returned if the base, is not found.