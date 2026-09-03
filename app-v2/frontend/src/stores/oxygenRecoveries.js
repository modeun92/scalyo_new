import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from './auth'

// ─── OXYGEN Lot 3b — recoveries: Closing + micro (contract R23 29/07/2026) ──
// First write of oxygen_recoveries. Decisions taken:
//   · kind 'cloture': written ONCE ONLY, AT THE END of the Closing
//     (completed=true, real duration_s, progress_count persisted). An escaped
//     Closing writes NOTHING and does not consume the day. 1/day, uniqueness enforced
//     here (no UNIQUE constraint in the database — checked at the gate): soft refusal if already closed.
//   · kind 'micro': written at the end of the 90 s only, max 2/day.
// REST-SPA rule (pitfall hit on 28/07): a control GET after EVERY write —
// the local state comes from the RE-READ, never from the 200 alone.
// Self-only RLS. NO text here (t() forbidden in a store — the view renders everything).

const todayStr = () => new Date().toISOString().slice(0, 10) // convention UTC oxygen

export const useOxygenRecoveriesStore = defineStore('oxygenRecoveries', () => {
  const todayClosing = ref(null)      // completed 'cloture' row of the day (or null)
  const microToday = ref([])          // 'micro' rows of the day
  const todayLoaded = ref(false)
  const saving = ref(false)

  // The Sky — data for the calendar MONTH, all PERSISTED (determinism):
  // closings + energy from check-ins + load_score from daily rows. Never live data.
  const monthRows = ref([])
  const monthCheckins = ref({})       // { 'YYYY-MM-DD': energy }
  const monthDaily = ref({})          // { 'YYYY-MM-DD': load_score }
  const monthLoaded = ref(false)

  // Client notes written TODAY by the user (progress — read-only)
  const notesCountToday = ref(0)

  // Shared dot/page UI: the Closing overlay is rendered by OxygenPulse
  const closingOpen = ref(false)
  const closingMode = ref('cloture') // 'cloture' | 'micro'
  const microDismissedDate = ref(null) // local session dismiss — never written

  const microCountToday = computed(() => microToday.value.length)
  const microDismissedToday = computed(() => microDismissedDate.value === todayStr())

  function openClosing(mode = 'cloture') { closingMode.value = mode; closingOpen.value = true }
  function closeOverlay() { closingOpen.value = false }
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
    todayClosing.value = rows.find(r => r.kind === 'cloture' && r.completed) || null
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
      console.error('[oxygen] sky month failed:',
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

  // SINGLE write of the Closing, AT THE END + control GET (REST-SPA)
  async function closeToday({ durationS, progressCount }) {
    if (saving.value) return { error: 'busy' }
    const auth = useAuthStore(); const userId = auth.user?.id
    if (!userId) return { error: 'not_authenticated' }
    if (todayClosing.value) return { error: 'already_closed' } // soft refusal, never 2 rows
    const okInt = v => Number.isInteger(v) && v >= 0
    if (!okInt(durationS) || !okInt(progressCount)) {
      console.warn('[oxygen] closing SKIP: invalid values')
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
      console.log('[oxygen] closing payload:', JSON.stringify(payload))
      const { error } = await withWrite(
        () => supabase.from('oxygen_recoveries').insert([payload]).select(),
        { label: 'oxygen.recoveries.closing' }
      )
      if (error) { console.error('[oxygen] closing failed:', error.message || error); return { error } }
      await loadToday() // control GET: the truth comes from the re-read
      if (!todayClosing.value) {
        console.error('[oxygen] closing NOT RE-READ — write not confirmed (REST-SPA?)')
        return { error: 'not_confirmed' }
      }
      monthLoaded.value = false // the Sky will reload with the day's bubble
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
      await loadToday() // control GET
      if (microCountToday.value <= before) {
        console.error('[oxygen] micro NOT RE-READ — write not confirmed')
        return { error: 'not_confirmed' }
      }
      return { success: true }
    } finally { saving.value = false }
  }

  return {
    todayClosing, microToday, todayLoaded, saving,
    monthRows, monthCheckins, monthDaily, monthLoaded, notesCountToday,
    closingOpen, closingMode, microCountToday, microDismissedToday,
    openClosing, closeOverlay, dismissMicroToday,
    loadToday, loadMonth, loadNotesCountToday, closeToday, microDone,
  }
})
