/**
 * Portfolio View — Shared helpers
 */

// fmtNum retiré (CURRENCY-FORMAT 25/08) : montants = lib/formatters.fmtCurrency({ compact })

// fmtDate(d, locale) retiré (DATE-RAW 25/08) : dates = lib/formatters.fmtDate (locale globale)

// sClass(status) retiré (HEALTH-SCALE 25/08) : teinte = lib/health.healthTone(statut effectif)

export function renewSoon(c) {
  const d = new Date(c.renewalDate)
  return d.getTime() - Date.now() < 45 * 864e5 && d >= new Date()
}
