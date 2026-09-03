import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from './auth'
import { useOxygenLoadStore } from './oxygenLoad'
import { useOxygenEngineStore } from './oxygenEngine'
import { useOxygenCheckinsStore } from './oxygenCheckins'

// ─── OXYGEN Lot 1+2 — daily persistence (contracts R23 28/07/2026) ──────
// snapshots pattern / B-10b guard replicated: JSON-normalized payload (undefined
// dropped) + anti-empty guard (warn + return, never write empty data) + withWrite
// with {error} checked + local state updated AFTER a confirmed write + a log on
// EVERY call. Lot 2: index = engine.indexToday — null without the day's check-in
// (R21: never invented); {force:true} rewrites the day's row after a
// confirmed check-in. Self-only RLS: the upsert can only touch the user's own row.

export const useOxygenDailyStore = defineStore('oxygenDaily', () => {
  const lastSavedDate = ref(null)
  const saving = ref(false)
  const history = ref([])        // Lot 2: 30 d (date, load_score, index) — feeds the divergence
  const historyLoaded = ref(false)

  async function loadHistory30() {
    const auth = useAuthStore()
    const userId = auth.user?.id
    if (!userId) return
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('oxygen_daily')
      .select('date, load_score, index')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: true })
    if (error) { console.error('[oxygen] daily history failed:', error.message); return }
    history.value = data || []
    historyLoaded.value = true
  }

  async function upsertToday({ force = false } = {}) {
    if (saving.value) return
    const auth = useAuthStore()
    const userId = auth.user?.id
    if (!userId) return
    const today = new Date().toISOString().slice(0, 10)
    if (!force && lastSavedDate.value === today) return // 1 write per day and per session (except a forced post-check-in one)
    saving.value = true
    try {
      const load = useOxygenLoadStore()
      const engine = useOxygenEngineStore()
      const checkins = useOxygenCheckinsStore()
      const raw = {
        user_id: userId,
        organization_id: auth.profile?.organization_id ?? null,
        date: today,
        load_score: load.loadScore,
        components: load.components,
        updated_at: new Date().toISOString(),
      }
      // OXY-IDX-NULL guard (class B-10b, column level): the index only enters the
      // payload IF the day's check-in state is loaded. Column omitted → the UPDATE
      // keeps the value in the database; a boot never overwrites a real index with null.
      if (checkins.historyLoaded) raw.index = engine.indexToday // null if there is no check-in (R21)
      const payload = JSON.parse(JSON.stringify(raw))
      console.log('[oxygen] daily payload:', JSON.stringify(payload))
      // B-10b guard: never overwrite a healthy row with an incomplete payload
      if (typeof payload.load_score !== 'number' || !payload.components ||
          !Object.keys(payload.components).length) {
        console.warn('[oxygen] daily SKIP: incomplete payload (undefined values at the source)')
        return
      }
      const { error } = await withWrite(
        () => supabase.from('oxygen_daily').upsert(payload, { onConflict: 'user_id,date' }),
        { label: 'oxygen.daily.upsert' }
      )
      if (error) { console.error('[oxygen] daily upsert failed:', error.message || error); return }
      lastSavedDate.value = today // local state AFTER a confirmed write
      // Update the day's row in the local history (the divergence reads this window)
      const prevLocal = history.value.find(r => r.date === today)
      const rowLocal = { date: today, load_score: payload.load_score, index: 'index' in payload ? payload.index : (prevLocal?.index ?? null) }
      const i = history.value.findIndex(r => r.date === today)
      if (i >= 0) history.value.splice(i, 1, rowLocal); else history.value.push(rowLocal)
    } catch (e) {
      console.error('[oxygen] daily upsert failed:', e.message || e)
    } finally { saving.value = false }
  }

  return { lastSavedDate, saving, history, historyLoaded, loadHistory30, upsertToday }
})
