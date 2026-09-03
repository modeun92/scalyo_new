// ─── OXYGEN Lot 3b — bulle générative DÉTERMINISTE (contrat R23 29/07/2026) ───
// seed = `${user_id}:${date}` → mulberry32 : MÊME entrée → MÊME bulle, pour
// toujours (preuve ②). Toutes les entrées visuelles sont PERSISTÉES :
//   teinte      = energy du check-in (oxygen_checkins)
//   profondeur  = load_score du jour (oxygen_daily)
//   texture     = progress_count de la Fermeture (oxygen_recoveries)
// Jamais de donnée live, JAMAIS Math.random (il casserait le déterminisme).
// Palette apaisée : teinte bornée violet→bleu — zéro rouge (règle produit).
// Aucune donnée brute lisible dans le SVG rendu.

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
  const hue = Math.round(260 - ((e - 1) / 4) * 55)   // énergie basse → violet profond, haute → bleu clair
  const sat = Math.round(45 + ((e - 1) / 4) * 25)
  const light = Math.round(38 + ((e - 1) / 4) * 22)
  const depth = 0.35 + (l / 100) * 0.5               // charge du jour → profondeur du cœur
  const r = 9 + e * 1.6 + rnd() * 3                  // rayon organique
  const dx = (rnd() - 0.5) * 8                       // dérive douce dans la case
  const dy = (rnd() - 0.5) * 8
  const speckles = Math.min(8, p)                    // texture = progrès persisté
  const dots = Array.from({ length: speckles }, () => ({
    a: rnd() * Math.PI * 2,
    d: 0.35 + rnd() * 0.5,
    s: 0.8 + rnd() * 1.4,
  }))
  return { hue, sat, light, depth, r, dx, dy, dots }
}
