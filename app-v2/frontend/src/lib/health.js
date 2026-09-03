// HEALTH-SCALE (decision by Lidia 25/08/2026): the client health score is out of 10, EVERYWHERE.
// Single source for the scale, the thresholds and the effective status. Before this module, the
// same `clients.health` value was rendered ×10 on Satisfaction ("10 /100"), raw
// on the Portfolio ("5") and as "x/10" on the Dashboard, with three sets of thresholds
// (store 3/6 · Satisfaction 50/70 · Manager 5/7) and two status sources (entered vs
// effective). Any surface that displays, colors or ranks a score goes through here —
// never a ×10, never a local threshold, never a raw `c.status` for a color.
// Localized formatting ("7,5/10") lives in lib/formatters.fmtHealth (C7).

export const HEALTH_MAX = 10

// Thresholds on the /10 scale (frozen formula R21): ≤ 3 critical · ≤ 6 watch · > 6 healthy.
export const HEALTH_THRESHOLDS = Object.freeze({ critical: 3, watch: 6 })

// Numeric value of the score, or null if missing/invalid. No clamping: an out-of-scale
// value in the database must be VISIBLE ("15/10"), not papered over.
export function toHealthNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Effective status: the entered status can only WORSEN the status derived from the score
// ("worst of the two wins"). Semantics identical to the old
// clients.getEffectiveStatus, with one exception: a missing score is no longer coerced to
// 0 (`null <= 3` → critical) — it does not count, the entered status decides.
export function healthStatus(health, status) {
  const h = toHealthNumber(health)
  if (status === 'critical' || (h !== null && h <= HEALTH_THRESHOLDS.critical)) return 'critical'
  if (status === 'watch' || status === 'todo' || (h !== null && h <= HEALTH_THRESHOLDS.watch)) return 'watch'
  return 'healthy'
}

// CSS hue (existing .green / .amber / .red classes in portfolio.css, satisfaction.css…)
export function healthTone(status) {
  return status === 'healthy' ? 'green' : status === 'watch' ? 'amber' : 'red'
}

// Inline color via the theme variables (main.css --green/--amber/--red, light + dark).
// To be used in a `style`, never in an SVG attribute (stroke=/fill=) — var() is not
// guaranteed there: go through :style="{ stroke: … }".
export function healthColor(status) {
  return `var(--${healthTone(status)})`
}

// Bar width (0–100 %) for a score out of 10.
export function healthPct(health) {
  const h = toHealthNumber(health)
  if (h === null) return 0
  return Math.min(100, Math.max(0, (h / HEALTH_MAX) * 100))
}
