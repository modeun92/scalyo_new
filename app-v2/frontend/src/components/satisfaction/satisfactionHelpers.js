// fmtNum retiré (CURRENCY-FORMAT 25/08, code mort) : montants = lib/formatters.fmtCurrency

// scoreColor(score/100) retiré (HEALTH-SCALE 25/08) : seuils 50/70 locaux contredisaient
// le statut effectif (3/6 sur /10). Teinte = lib/health.healthTone(healthStatus(...)).

export function pct(count, total) {
  return total ? (count / total) * 100 : 0
}


// A-11 : l'ancienne implementation locale (en->USD, ko->KRW) mentait sur la devise.
// Re-export du formateur central : devise du COMPTE, formatage a la locale.
export { fmtCurrency } from '@/lib/formatters'
