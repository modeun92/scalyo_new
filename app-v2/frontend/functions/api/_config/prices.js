// === SCALYO — THE SINGLE price table (BILLING-SEAT, D3 27/08/2026) ===
// The only declaration of the product's prices. Amounts in Stripe's smallest unit
// (unit_amount): cents for EUR/USD, whole won for KRW (a zero-decimal currency).
// The Stripe webhook derives PRICE_TO_PLAN from it; /api/billing serves the grid from it.
// No price on the front end, ever.

export const PRICES = {
  eur: { starter: 7900, growth: 11900, elite: 15900 },
  usd: { starter: 8900, growth: 13900, elite: 18900 },
  krw: { starter: 139000, growth: 209000, elite: 279000 },
}

// Divisor from the smallest unit → the major unit (Stripe: KRW is "zero-decimal").
export const MINOR_UNITS = { eur: 100, usd: 100, krw: 1 }

export const DEFAULT_CURRENCY = 'eur'
export const BILLING_INTERVAL = 'month'

// 'eur_15900' → 'elite' — same shape as the webhook's old constant.
export const PRICE_TO_PLAN = Object.fromEntries(
  Object.entries(PRICES).flatMap(([currency, plans]) =>
    Object.entries(plans).map(([plan, amount]) => [currency + '_' + amount, plan])
  )
)

export function normalizeCurrency(currency) {
  const c = String(currency || '').toLowerCase()
  return PRICES[c] ? c : null
}

export function planFromPrice(currency, unitAmount) {
  return PRICE_TO_PLAN[String(currency || '').toLowerCase() + '_' + unitAmount] || null
}

// Stripe amount (smallest unit) → major unit: 15900 eur → 159; 279000 krw → 279000.
export function toMajor(amount, currency) {
  const c = normalizeCurrency(currency)
  if (amount == null || !c) return null
  return Number(amount) / MINOR_UNITS[c]
}

// Plan grid in the major unit for a currency; unknown currency → default.
export function pricesFor(currency) {
  const c = normalizeCurrency(currency) || DEFAULT_CURRENCY
  const prices = Object.fromEntries(Object.entries(PRICES[c]).map(([plan, amt]) => [plan, toMajor(amt, c)]))
  return { currency: c, prices }
}
