// CURRENCY-ACCOUNT (04/09): the SINGLE list of currencies an account can report in.
// Before this file the account currency existed in the database (user_profiles.currency,
// default 'EUR') but NOWHERE in the interface — no screen ever wrote it, so every amount
// in the product rendered in euro whatever the account really billed in (error_list §5).
// Adding a currency = adding its ISO 4217 code here, nothing else: fmtCurrency /
// currencySymbol / kpiUnit all read the account value through lib/formatters.
//
// ISO 4217 codes only — Intl.NumberFormat needs the code, never the symbol. The symbol and
// the currency NAME are derived at render time from the code + the display locale
// (currencySymbol / currencyLabel), so this list carries no translated string: a new
// currency needs no i18n key in the three files.
//
// ZERO CONVERSION (A-11): changing this setting changes how amounts are LABELLED, never
// their value. 1 200 stored becomes "$1,200", not the euro amount converted to dollars.
// The list stays a superset of the billing currencies in stores/countryLaws.js
// (EUR · CHF · CAD · USD · KRW) — a quote keeps the currency of its own billing country.
export const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'KRW', 'JPY', 'CNY', 'CAD', 'AUD', 'NZD',
  'SGD', 'HKD', 'INR', 'BRL', 'MXN', 'AED', 'SEK', 'NOK', 'DKK', 'PLN',
]

// Same default as the database column (user_profiles.currency DEFAULT 'EUR'): a profile
// that has never chosen keeps rendering exactly as before this file existed.
export const DEFAULT_CURRENCY = 'EUR'

export function isSupportedCurrency(code) {
  return typeof code === 'string' && SUPPORTED_CURRENCIES.includes(code.trim().toUpperCase())
}
