// HEALTH-SCALE — THIRD mirror of src/lib/health.js. PARITY IS MANDATORY.
//
// The scale and thresholds now exist in three places and all three must change together:
//   1. app-v2/frontend/src/lib/health.js                        (canonical, front end)
//   2. app-v2/frontend/functions/api/_services/context.service.js (AI context)
//   3. this file                                                 (MCP)
//
// MCP-HEALTH-PARITY (14/09/2026): a copy is the wrong shape and we know it — but this
// Worker is a separate Cloudflare deploy with its own bundle, so it cannot import from the
// Pages app. The cost of getting it wrong is now higher than it was: before MCP, a drifted
// threshold made a screen disagree with a prompt. Now it makes ChatGPT tell a customer an
// account is healthy while the Scalyo UI shows it critical, and the customer believes the
// chat. See test/health-parity.test.ts, which reads lib/health.js and fails if the numbers
// here diverge.

export const HEALTH_MAX = 10

/** Frozen formula R21: <= 3 critical, <= 6 watch, > 6 healthy. */
export const HEALTH_THRESHOLDS = Object.freeze({ critical: 3, watch: 6 })

export type EffectiveStatus = 'critical' | 'watch' | 'healthy'

/**
 * Numeric score, or null when missing/invalid. No clamping — an out-of-scale value in the
 * database must stay visible ("15/10"), not be papered over.
 *
 * R21: 0 is a REAL score. Never `Number(v) || fallback` here.
 */
export function toHealthNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

/**
 * Effective status, "worst of the two wins": the entered status can only WORSEN the
 * status derived from the score. A missing score does not count — the entered status
 * decides (a null score must not coerce to 0 and read as critical).
 */
export function healthStatus(health: unknown, status: unknown): EffectiveStatus {
  const h = toHealthNumber(health)
  if (status === 'critical' || (h !== null && h <= HEALTH_THRESHOLDS.critical)) return 'critical'
  if (status === 'watch' || status === 'todo' || (h !== null && h <= HEALTH_THRESHOLDS.watch)) return 'watch'
  return 'healthy'
}

/** Health band as an MCP tool input filter. Same thresholds, no second scale. */
export function matchesHealthBand(band: EffectiveStatus | undefined, health: unknown, status: unknown): boolean {
  if (!band) return true
  return healthStatus(health, status) === band
}

/**
 * ARR of a client. `arr` when present, otherwise mrr * 12.
 *
 * R21: returns null when NEITHER is set — never 0. A portfolio whose ARR is unknown must
 * render as "—", and an AI client must not be handed a 0 it will report as "no revenue".
 * Mirrors the intent of context.service.clientArr, which coerces to 0 because it is
 * building a prose prompt; a structured API cannot afford that.
 */
export function clientArr(client: { arr?: unknown; mrr?: unknown }): number | null {
  const arr = client.arr == null || client.arr === '' ? null : Number(client.arr)
  if (arr !== null && !Number.isNaN(arr)) return arr
  const mrr = client.mrr == null || client.mrr === '' ? null : Number(client.mrr)
  if (mrr !== null && !Number.isNaN(mrr)) return mrr * 12
  return null
}

/**
 * Prospect exclusion (lesson COUNT-353-352). Portfolio counters, health aggregates and
 * alerts EXCLUDE prospects. The `clientsOnly` rule, restated for MCP.
 */
export function isCustomer(client: { lifecycle?: unknown }): boolean {
  return client.lifecycle !== 'prospect'
}

/** Whole days from today to an ISO date, or null if absent/unparseable. Negative = past. */
export function daysUntil(isoDate: unknown, reference: Date = new Date()): number | null {
  if (!isoDate || typeof isoDate !== 'string') return null
  const target = new Date(isoDate)
  if (Number.isNaN(target.getTime())) return null
  // Compare calendar days, not instants — a renewal "today" must not read as -1 because
  // the reference clock is a few hours ahead. TZ-PLANNING, same spirit as localDateKey().
  const a = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  const b = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  return Math.round((a - b) / 86400000)
}
