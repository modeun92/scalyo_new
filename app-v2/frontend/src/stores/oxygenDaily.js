import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from './auth'
import { useOxygenLoadStore } from './oxygenLoad'
import { useOxygenEngineStore } from './oxygenEngine'
import { useOxygenCheckinsStore } from './oxygenCheckins'

// ─── OXYGEN Lot 1+2 — persistance quotidienne (contrats R23 28/07/2026) ──────
// Pattern snapshots / garde B-10b répliqué : payload normalisé JSON (undefined
// droppés) + garde anti-vide (warn + return, jamais écrire du vide) + withWrite
// avec {error} testé + état local mis à jour APRÈS écriture confirmée + log à
// CHAQUE appel. Lot 2 : index = engine.indexToday — null sans check-in du jour
// (R21 : jamais inventé) ; {force:true} ré-écrit la ligne du jour après un
// check-in confirmé. RLS self-only : l'upsert ne peut toucher que la ligne du user.

export const useOxygenDailyStore = defineStore('oxygenDaily', () => {
  const lastSavedDate = ref(null)
  const saving = ref(false)
  const history = ref([])        // Lot 2 : 30 j (date, load_score, index) — nourrit la divergence
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
    if (!force && lastSavedDate.value === today) return // 1 écriture par jour et par session (sauf force post-check-in)
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
      // Garde OXY-IDX-NULL (classe B-10b, niveau colonne) : l'indice n'entre dans le
      // payload QUE si l'état check-in du jour est chargé. Colonne omise → l'UPDATE
      // conserve la valeur en base ; jamais un boot n'écrase un indice réel par null.
      if (checkins.historyLoaded) raw.index = engine.indexToday // null si pas de check-in (R21)
      const payload = JSON.parse(JSON.stringify(raw))
      console.log('[oxygen] daily payload:', JSON.stringify(payload))
      // Garde B-10b : jamais écraser une ligne saine par un payload incomplet
      if (typeof payload.load_score !== 'number' || !payload.components ||
          !Object.keys(payload.components).length) {
        console.warn('[oxygen] daily SKIP: payload incomplet (valeurs undefined à la source)')
        return
      }
      const { error } = await withWrite(
        () => supabase.from('oxygen_daily').upsert(payload, { onConflict: 'user_id,date' }),
        { label: 'oxygen.daily.upsert' }
      )
      if (error) { console.error('[oxygen] daily upsert failed:', error.message || error); return }
      lastSavedDate.value = today // état local APRÈS écriture confirmée
      // Maj de la ligne du jour dans l'history locale (la divergence lit cette fenêtre)
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
