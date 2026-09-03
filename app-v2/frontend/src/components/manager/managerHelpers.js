/**
 * Manager View — Shared helpers
 */

// B-09 : pas de donnée (null) → pas de classe couleur
export function wellbeingClass(score) {
  if (typeof score !== 'number') return ''
  return score >= 70 ? 'green' : score >= 50 ? 'amber' : 'red'
}

export function workloadClass(load) {
  if (typeof load !== 'number') return ''
  return load <= 60 ? 'green' : load <= 80 ? 'amber' : 'red'
}

