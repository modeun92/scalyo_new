// fmtNum removed (CURRENCY-FORMAT 25/08, dead code): amounts = lib/formatters.fmtCurrency

// scoreColor(score/100) removed (HEALTH-SCALE 25/08): local 50/70 thresholds contradicted
// the effective status (3/6 on the /10 scale). Hue = lib/health.healthTone(healthStatus(...)).

export function pct(count, total) {
  return total ? (count / total) * 100 : 0
}


// A-11: the old local implementation (en->USD, ko->KRW) lied about the currency.
// Re-export of the central formatter: ACCOUNT currency, formatted to the locale.
export { fmtCurrency } from '@/lib/formatters'
