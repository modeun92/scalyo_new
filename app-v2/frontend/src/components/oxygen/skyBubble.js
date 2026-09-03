// ─── OXYGEN Lot 3b — DETERMINISTIC generative bubble (contract R23 29/07/2026) ───
// seed = `${user_id}:${date}` → mulberry32: SAME input → SAME bubble, for
// ever (evidence ②). All visual inputs are PERSISTED:
//   hue    = energy from the check-in (oxygen_checkins)
//   depth  = load_score of the day (oxygen_daily)
//   texture = progress_count of the Closing (oxygen_recoveries)
// Never live data, NEVER Math.random (it would break determinism).
// Calm palette: hue bounded violet→blue — zero red (product rule).
// No raw data readable in the rendered SVG.

export function hashSeed(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function bubbleParams({ userId, date, energy, load, progress }) {
  const rnd = mulberry32(hashSeed(`${userId}:${date}`))
  const e = Number.isFinite(energy) ? Math.min(5, Math.max(1, energy)) : 3
  const l = Number.isFinite(load) ? Math.min(100, Math.max(0, load)) : 0
  const p = Number.isFinite(progress) ? Math.min(12, Math.max(0, progress)) : 0
  const hue = Math.round(260 - ((e - 1) / 4) * 55)   // low energy → deep violet, high → light blue
  const sat = Math.round(45 + ((e - 1) / 4) * 25)
  const light = Math.round(38 + ((e - 1) / 4) * 22)
  const depth = 0.35 + (l / 100) * 0.5               // load of the day → depth of the core
  const r = 9 + e * 1.6 + rnd() * 3                  // organic radius
  const dx = (rnd() - 0.5) * 8                       // gentle drift inside the cell
  const dy = (rnd() - 0.5) * 8
  const speckles = Math.min(8, p)                    // texture = persisted progress
  const dots = Array.from({ length: speckles }, () => ({
    a: rnd() * Math.PI * 2,
    d: 0.35 + rnd() * 0.5,
    s: 0.8 + rnd() * 1.4,
  }))
  return { hue, sat, light, depth, r, dx, dy, dots }
}
