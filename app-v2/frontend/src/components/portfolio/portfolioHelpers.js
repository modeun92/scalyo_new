/**
 * Portfolio View — Shared helpers
 */

// fmtNum removed (CURRENCY-FORMAT 25/08): amounts = lib/formatters.fmtCurrency({ compact })

// fmtDate(d, locale) removed (DATE-RAW 25/08): dates = lib/formatters.fmtDate (global locale)

// sClass(status) removed (HEALTH-SCALE 25/08): hue = lib/health.healthTone(effective status)

export function renewSoon(c) {
  const d = new Date(c.renewalDate)
  return d.getTime() - Date.now() < 45 * 864e5 && d >= new Date()
}
