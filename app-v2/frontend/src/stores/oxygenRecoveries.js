import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from './auth'

// ─── OXYGEN Lot 3b — recoveries : Fermeture + micro (contrat R23 29/07/2026) ──
// Première écriture de oxygen_recoveries. Décisions actées :
//   · kind 'cloture' : écrite UNE SEULE fois, À LA FIN de la Fermeture
//     (completed=true, duration_s réel, progress_count persisté). Une Fermeture
//     échappée n'écrit RIEN et ne consomme pas le jour. 1/jour, unicité portée
//     ici (pas d'UNIQUE en base — vérifié au gate) : refus doux si déjà fermée.
//   · kind 'micro' : écrite à la fin des 90 s seulement, max 2/jour.
// Règle REST-SPA (piège vécu 28/07) : GET de contrôle après CHAQUE écriture —
// l'état local vient de la RELECTURE, jamais du 200 seul.
// RLS self-only. AUCUN texte ici (t() interdit en store — la vue rend tout).

const todayStr = () => new Date().toISOString().slice(0, 10) // convention UTC oxygen

export const useOxygenRecoveriesStore = defineStore('oxygenRecoveries', () => {
  const todayCloture = ref(null)      // ligne 'cloture' complétée du jour (ou null)
  const microToday = ref([])          // lignes 'micro' du jour
  const todayLoaded = ref(false)
  const saving = ref(false)

  // Le Ciel — données du MOIS calendaire, toutes PERSISTÉES (déterminisme) :
  // clôtures + energy des check-ins + load_score des daily. Jamais de live.
  const monthRows = ref([])
  const monthCheckins = ref({})       // { 'YYYY-MM-DD': energy }
  const monthDaily = ref({})          // { 'YYYY-MM-DD': load_score }
  const monthLoaded = ref(false)

  // Notes client posées AUJOURD'HUI par le user (progrès — lecture seule)
  const notesCountToday = ref(0)

  // UI partagée pastille/page : l'overlay Fermeture est rendu par OxygenPulse
  const fermetureOpen = ref(false)
  const fermetureMode = ref('cloture') // 'cloture' | 'micro'
  const microDismissedDate = ref(null) // dismiss local session — jamais écrit

  const microCountToday = computed(() => microToday.value.length)
  const microDismissedToday = computed(() => microDismissedDate.value === todayStr())

  function openFermeture(mode = 'cloture') { fermetureMode.value = mode; fermetureOpen.value = true }
  function closeOverlay() { fermetureOpen.value = false }
  function dismissMicroToday() { microDismissedDate.value = todayStr() }

  async function loadToday() {
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return
    const { data, error } = await supabase
      .from('oxygen_recoveries')
      .select('id, date, kind, duration_s, progress_count, completed, created_at')
      .eq('user_id', userId).eq('date', todayStr())
    if (error) { console.error('[oxygen] recoveries today failed:', error.message); return }
    const rows = data || []
    todayCloture.value = rows.find(r => r.kind === 'cloture' && r.completed) || null
    microToday.value = rows.filter(r => r.kind === 'micro')
    todayLoaded.value = true
  }

  async function loadMonth() {
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return
    const first = `${todayStr().slice(0, 7)}-01`
    const [rec, chk, dly] = await Promise.all([
      supabase.from('oxygen_recoveries')
        .select('date, progress_count')
        .eq('user_id', userId).eq('kind', 'cloture').eq('completed', true)
        .gte('date', first).order('date', { ascending: true }),
      supabase.from('oxygen_checkins')
        .select('date, energy').eq('user_id', userId).gte('date', first),
      supabase.from('oxygen_daily')
        .select('date, load_score').eq('user_id', userId).gte('date', first),
    ])
    if (rec.error || chk.error || dly.error) {
      console.error('[oxygen] ciel month failed:',
        (rec.error || chk.error || dly.error).message)
      return
    }
    monthRows.value = rec.data || []
    monthCheckins.value = Object.fromEntries((chk.data || []).map(r => [r.date, r.energy]))
    monthDaily.value = Object.fromEntries((dly.data || []).map(r => [r.date, r.load_score]))
    monthLoaded.value = true
  }

  async function loadNotesCountToday() {
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return
    const { count, error } = await supabase
      .from('client_notes')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .gte('created_at', `${todayStr()}T00:00:00Z`)
    if (error) { console.error('[oxygen] notes count failed:', error.message); return }
    notesCountToday.value = count || 0
  }

  // Écriture UNIQUE de la Fermeture, À LA FIN + GET de contrôle (REST-SPA)
  async function closeToday({ durationS, progressCount }) {
    if (saving.value) return { error: 'busy' }
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return { error: 'not_authenticated' }
    if (todayCloture.value) return { error: 'already_closed' } // refus doux, jamais 2 lignes
    const okInt = v => Number.isInteger(v) && v >= 0
    if (!okInt(durationS) || !okInt(progressCount)) {
      console.warn('[oxygen] cloture SKIP: valeurs invalides')
      return { error: 'invalid' }
    }
    saving.value = true
    try {
      const payload = JSON.parse(JSON.stringify({
        user_id: userId,
        organization_id: auth.profile?.organization_id ?? null,
        date: todayStr(),
        kind: 'cloture',
        duration_s: durationS,
        trigger_source: 'page',
        progress_count: progressCount,
        completed: true,
      }))
      console.log('[oxygen] cloture payload:', JSON.stringify(payload))
      const { error } = await withWrite(
        () => supabase.from('oxygen_recoveries').insert([payload]).select(),
        { label: 'oxygen.recoveries.cloture' }
      )
      if (error) { console.error('[oxygen] cloture failed:', error.message || error); return { error } }
      await loadToday() // GET de contrôle : la vérité vient de la relecture
      if (!todayCloture.value) {
        console.error('[oxygen] cloture NON RELUE — écriture non confirmée (REST-SPA ?)')
        return { error: 'not_confirmed' }
      }
      monthLoaded.value = false // le Ciel se rechargera avec la bulle du jour
      return { success: true }
    } finally { saving.value = false }
  }

  async function microDone({ durationS, triggerSource }) {
    if (saving.value) return { error: 'busy' }
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return { error: 'not_authenticated' }
    if (microCountToday.value >= 2) return { error: 'max_reached' }
    saving.value = true
    try {
      const payload = JSON.parse(JSON.stringify({
        user_id: userId,
        organization_id: auth.profile?.organization_id ?? null,
        date: todayStr(),
        kind: 'micro',
        duration_s: Number.isInteger(durationS) ? durationS : 90,
        trigger_source: triggerSource || 'pulse',
        completed: true,
      }))
      console.log('[oxygen] micro payload:', JSON.stringify(payload))
      const before = microCountToday.value
      const { error } = await withWrite(
        () => supabase.from('oxygen_recoveries').insert([payload]).select(),
        { label: 'oxygen.recoveries.micro' }
      )
      if (error) { console.error('[oxygen] micro failed:', error.message || error); return { error } }
      await loadToday() // GET de contrôle
      if (microCountToday.value <= before) {
        console.error('[oxygen] micro NON RELUE — écriture non confirmée')
        return { error: 'not_confirmed' }
      }
      return { success: true }
    } finally { saving.value = false }
  }

  return {
    todayCloture, microToday, todayLoaded, saving,
    monthRows, monthCheckins, monthDaily, monthLoaded, notesCountToday,
    fermetureOpen, fermetureMode, microCountToday, microDismissedToday,
    openFermeture, closeOverlay, dismissMicroToday,
    loadToday, loadMonth, loadNotesCountToday, closeToday, microDone,
  }
})
