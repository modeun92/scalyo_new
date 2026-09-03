// HEALTH-SCALE (arbitrage Lidia 25/08/2026) : le health score client est /10, PARTOUT.
// Source unique de l'échelle, des seuils et du statut effectif. Avant ce module, la
// même valeur `clients.health` était rendue ×10 sur Satisfaction (« 10 /100 »), brute
// sur le Portefeuille (« 5 ») et « x/10 » sur le Dashboard, avec trois jeux de seuils
// (store 3/6 · Satisfaction 50/70 · Manager 5/7) et deux sources de statut (saisi vs
// effectif). Toute surface qui affiche, colore ou classe un score passe ici —
// jamais de ×10, jamais de seuil local, jamais de `c.status` brut pour une couleur.
// Le formatage localisé (« 7,5/10 ») est dans lib/formatters.fmtHealth (C7).

export const HEALTH_MAX = 10

// Seuils sur /10 (formule figée R21) : ≤ 3 critique · ≤ 6 vigilance · > 6 sain.
export const HEALTH_THRESHOLDS = Object.freeze({ critical: 3, watch: 6 })

// Valeur numérique du score, ou null si absente/invalide. Aucun clamp : une valeur
// hors échelle en base doit se VOIR (« 15/10 »), pas être maquillée.
export function toHealthNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Statut effectif : le statut saisi ne peut qu'AGGRAVER le statut dérivé du score
// (« le pire des deux gagne »). Sémantique identique à l'ancien
// clients.getEffectiveStatus, à une exception près : un score absent ne vaut plus
// 0 par coercition (`null <= 3` → critique) — il ne compte pas, le statut saisi décide.
export function healthStatus(health, status) {
  const h = toHealthNumber(health)
  if (status === 'critical' || (h !== null && h <= HEALTH_THRESHOLDS.critical)) return 'critical'
  if (status === 'watch' || status === 'todo' || (h !== null && h <= HEALTH_THRESHOLDS.watch)) return 'watch'
  return 'healthy'
}

// Teinte CSS (classes .green / .amber / .red existantes dans portfolio.css, satisfaction.css…)
export function healthTone(status) {
  return status === 'healthy' ? 'green' : status === 'watch' ? 'amber' : 'red'
}

// Couleur inline via les variables de thème (main.css --green/--amber/--red, clair + sombre).
// À utiliser dans un `style`, jamais dans un attribut SVG (stroke=/fill=) — var() n'y est
// pas garanti : passer par :style="{ stroke: … }".
export function healthColor(status) {
  return `var(--${healthTone(status)})`
}

// Largeur de barre (0–100 %) pour un score /10.
export function healthPct(health) {
  const h = toHealthNumber(health)
  if (h === null) return 0
  return Math.min(100, Math.max(0, (h / HEALTH_MAX) * 100))
}
