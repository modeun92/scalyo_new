import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useOxygenLoadStore } from './oxygenLoad'
import { useOxygenCheckinsStore } from './oxygenCheckins'
import { useOxygenDailyStore } from './oxygenDaily'
import { useOxygenPrefsStore } from './oxygenPrefs'
import { useAuthStore } from './auth'
import { useTaskStore } from './tasks'
import { useClientStore } from './clients'
import { useQuoteStore } from './quotes'
import { useNotificationStore } from './notifications'

// ─── OXYGEN Lot 2 — engine : computed PURS (contrat R23 validé 28/07/2026) ───
// Formules figées (R21) :
//   ressenti_jour = moyenne(energy, mood, 6 − felt_load)            → 1..5
//   indice        = 0,6 × (ressenti × 20) + 0,4 × (100 − load_score) → 1 décimale
//   sans check-in du jour → indice = null, JAMAIS inventé.
// Divergence (self-facing) : les 5 derniers jours TRAVAILLÉS ont TOUS check-in +
// ligne oxygen_daily, avec ressenti ≥ 4 ET load ≥ 70 — un jour sans donnée
// suffit à l'éteindre (jamais inventé).
// Série avec pardon : 1 jour manqué / 7 jours glissants ne casse pas la série.
// Lot 3a : « jour travaillé » = prédicat UNIQUE oxygenPrefs.isWorkingDay
// (jours off perso ; défaut sam+dim = comportement Lot 2 inchangé).
// AUCUN texte ici (t() interdit en store — la vue rend les libellés).

export const OXY_EVENING_HOUR = 18   // acté Lidia 28/07 (contrat Lot 2) — heure LOCALE
export const OXY_DIV_FEEL_MIN = 4
export const OXY_DIV_LOAD_MIN = 70
export const OXY_DIV_DAYS = 5
export const OXY_PARDON_WINDOW = 7
export const OXY_HISTORY_DAYS = 30   // fenêtre chargée — la série affichée cape à « 30+ »
// Lot 3b (contrat R23 29/07) — micro-bulle : déclencheurs actés Lot 1
export const OXY_MICRO_MAX_PER_DAY = 2
export const OXY_MICRO_ALERT_HOURS = 24
export const OXY_MICRO_CRITICAL_MIN = 3
export const OXY_TOMORROW_RENEWAL_DAYS = 7

const DAY = 86400000
const dstr = d => d.toISOString().slice(0, 10)                 // convention UTC (= oxygen_daily)

export function feltComposite(c) {
  if (!c) return null
  return (c.energy + c.mood + (6 - c.felt_load)) / 3           // 1..5
}

export function isEvening(now = new Date()) {
  return now.getHours() >= OXY_EVENING_HOUR                    // heure locale (état visuel)
}

export const useOxygenEngineStore = defineStore('oxygenEngine', () => {
  // Indice du jour — null sans check-in (R21)
  const indexToday = computed(() => {
    const checkins = useOxygenCheckinsStore()
    const load = useOxygenLoadStore()
    const r = feltComposite(checkins.todayCheckin)
    if (r == null) return null
    const v = 0.6 * (r * 20) + 0.4 * (100 - load.loadScore)
    return Math.round(v * 10) / 10                             // 1 décimale (stockage)
  })

  // Divergence : OXY_DIV_DAYS jours travaillés consécutifs (les plus récents) complets
  const divergenceActive = computed(() => {
    const checkins = useOxygenCheckinsStore()
    const daily = useOxygenDailyStore()
    const prefs = useOxygenPrefsStore()
    if (!checkins.historyLoaded || !daily.historyLoaded) return false
    const byDateC = new Map(checkins.history.map(c => [c.date, c]))
    const byDateD = new Map(daily.history.map(r => [r.date, r]))
    let checked = 0
    for (let i = 0; i < OXY_HISTORY_DAYS && checked < OXY_DIV_DAYS; i++) {
      const d = new Date(Date.now() - i * DAY)
      if (!prefs.isWorkingDay(d)) continue
      const c = byDateC.get(dstr(d))
      const r = byDateD.get(dstr(d))
      if (!c || !r || typeof r.load_score !== 'number') return false  // donnée absente → éteinte
      if (feltComposite(c) < OXY_DIV_FEEL_MIN || r.load_score < OXY_DIV_LOAD_MIN) return false
      checked++
    }
    return checked >= OXY_DIV_DAYS
  })

  // Série avec pardon — JOURS TRAVAILLÉS uniquement (acté Lidia 28/07 ; jours
  // off/fériés personnalisés actés au contrat Lot 3a — prédicat oxygenPrefs).
  // Départ aujourd'hui (ou la veille si pas encore de check-in ce jour) ; un jour
  // travaillé manqué est pardonné si aucun autre pardon dans les 7 jours plus
  // récents ; un 2e manqué dans la fenêtre = fin de série. null tant que non chargé.
  const streak = computed(() => {
    const checkins = useOxygenCheckinsStore()
    const prefs = useOxygenPrefsStore()
    if (!checkins.historyLoaded) return null
    const dates = new Set(checkins.history.map(c => c.date))
    let start = new Date()
    if (!dates.has(dstr(start))) start = new Date(start.getTime() - DAY)
    let count = 0
    let lastPardonTs = null
    for (let i = 0; i < OXY_HISTORY_DAYS; i++) {
      const d = new Date(start.getTime() - i * DAY)
      if (!prefs.isWorkingDay(d)) continue                     // jour off : ni compté, ni cassant
      if (dates.has(dstr(d))) { count++; continue }
      if (lastPardonTs === null || (lastPardonTs - d.getTime()) >= OXY_PARDON_WINDOW * DAY) {
        lastPardonTs = d.getTime()                             // pardonné — la série continue
        continue
      }
      break                                                    // 2e manqué dans la fenêtre
    }
    return count
  })

  const streakCapped = computed(() => (streak.value ?? 0) >= OXY_HISTORY_DAYS)

  // ─── Lot 3b — Fermeture : progrès du jour (lecture PURE, R21) ───────────────
  // tasksDone = proxy honnête faute de finished_at : tâche finie ET touchée
  // aujourd'hui (updatedAt du jour) — approximation DÉCLARÉE au CR.
  // quotesCreated = devis créés aujourd'hui (le « gagné aujourd'hui » n'existe
  // pas en base — jamais inventé). clientsAdded = clients assignés créés ce jour.
  const dayProgress = computed(() => {
    const tasks = useTaskStore()
    const quotes = useQuoteStore()
    const clients = useClientStore()
    const auth = useAuthStore()
    const today = dstr(new Date())
    const uid = auth.user?.id
    const tasksDone = tasks.tasks.filter(t =>
      (t.finished || t.status === 'done') && (t.updatedAt || '').slice(0, 10) === today
    ).length
    const quotesCreated = quotes.quotes.filter(q => (q.createdAt || '') === today).length
    const clientsAdded = uid ? clients.clients.filter(c =>
      c.csmId === uid && (c.created_at || '').slice(0, 10) === today
    ).length : 0
    return { tasksDone, quotesCreated, clientsAdded }
  })

  // ─── Lot 3b — micro-bulle : déclencheurs actés Lot 1 ────────────────────────
  // churn_risk/nps_drop < 24 h sur un client ASSIGNÉ, OU ≥ 3 critiques assignés.
  // Le rendu (halo pastille) reste NEUTRE : aucun détail hors clic volontaire.
  const microTriggerSource = computed(() => {
    const load = useOxygenLoadStore()
    const notifs = useNotificationStore()
    if (load.criticalAssigned >= OXY_MICRO_CRITICAL_MIN) return 'critical3'
    const since = Date.now() - OXY_MICRO_ALERT_HOURS * 3600000
    const hit = notifs.notifications.some(n =>
      (n.type === 'churn_risk' || n.type === 'nps_drop') &&
      n.created_at && new Date(n.created_at).getTime() >= since &&
      n.target_id && load.assignedClientIds.has(n.target_id)
    )
    return hit ? 'alert' : null
  })
  const microTriggerActive = computed(() => microTriggerSource.value != null)

  // ─── Lot 3b — « Demain est prêt » : top 3 réels, clés i18n + params (D-11) ──
  // Ordre spec §5 : renouvellements proches → tâches dues → comptes critiques.
  const tomorrowTop3 = computed(() => {
    const load = useOxygenLoadStore()
    const tasks = useTaskStore()
    const clients = useClientStore()
    const out = []
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now.getTime() + OXY_TOMORROW_RENEWAL_DAYS * DAY)
    const renewals = load.assignedClients
      .map(c => ({ c, d: c.renewalDate ? new Date(c.renewalDate) : null }))
      .filter(x => x.d && !Number.isNaN(x.d.getTime()) && x.d >= now && x.d <= limit)
      .sort((a, b) => a.d - b.d)
    for (const { c, d } of renewals) {
      out.push({ key: 'oxy_tm_renewal', params: { name: c.name, n: Math.max(0, Math.round((d - now) / DAY)) } })
    }
    const tomorrow = dstr(new Date(Date.now() + DAY))
    const dues = tasks.tasks
      .filter(t => t.status !== 'done' && !t.finished && t.endDate && t.endDate <= tomorrow)
      .sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : (b.urgency ?? 3) - (a.urgency ?? 3)))
    for (const t of dues) out.push({ key: 'oxy_tm_task', params: { title: t.title } })
    const criticals = load.assignedClients.filter(c => clients.getEffectiveStatus(c) === 'critical')
    for (const c of criticals) out.push({ key: 'oxy_tm_critical', params: { name: c.name } })
    return out.slice(0, 3)
  })

  return {
    indexToday, divergenceActive, streak, streakCapped,
    dayProgress, microTriggerSource, microTriggerActive, tomorrowTop3,
  }
})
