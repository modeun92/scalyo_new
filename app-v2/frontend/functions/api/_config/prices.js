// === SCALYO — Table de prix UNIQUE (BILLING-SEAT, D3 27/08/2026) ===
// Seule déclaration des prix du produit. Montants dans l'unité minimale Stripe
// (unit_amount) : centimes pour EUR/USD, won entier pour KRW (devise sans décimale).
// Le webhook Stripe en dérive PRICE_TO_PLAN ; /api/billing en sert la grille.
// Aucun prix côté front, jamais.

export const PRICES = {
  eur: { starter: 7900, growth: 11900, elite: 15900 },
  usd: { starter: 8900, growth: 13900, elite: 18900 },
  krw: { starter: 139000, growth: 209000, elite: 279000 },
}

// Diviseur unité minimale → unité majeure (Stripe : KRW est « zero-decimal »).
export const MINOR_UNITS = { eur: 100, usd: 100, krw: 1 }

export const DEFAULT_CURRENCY = 'eur'
export const BILLING_INTERVAL = 'month'

// 'eur_15900' → 'elite' — même forme que l'ancienne constante du webhook.
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

// Montant Stripe (unité minimale) → unité majeure : 15900 eur → 159 ; 279000 krw → 279000.
export function toMajor(amount, currency) {
  const c = normalizeCurrency(currency)
  if (amount == null || !c) return null
  return Number(amount) / MINOR_UNITS[c]
}

// Grille des plans en unité majeure pour une devise ; devise inconnue → défaut.
export function pricesFor(currency) {
  const c = normalizeCurrency(currency) || DEFAULT_CURRENCY
  const prices = Object.fromEntries(Object.entries(PRICES[c]).map(([plan, amt]) => [plan, toMajor(amt, c)]))
  return { currency: c, prices }
}
