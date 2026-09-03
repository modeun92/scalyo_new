import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from './auth'
import { useOxygenDailyStore } from './oxygenDaily'

// ─── OXYGEN Lot 2 — check-in du jour (contrat R23 validé 28/07/2026) ─────────
// Pattern clientNotes / B-10b : payload normalisé + garde anti-vide + withWrite
// avec {error} testé + état local mis à jour APRÈS écriture confirmée + log à
// chaque appel. RLS self-only : chacun ne lit/n'écrit QUE sa propre ligne.
// Aucun texte ici (t() interdit en store — la vue rend tous les libellés).

const todayStr = () => new Date().toISOString().slice(0, 10) // même convention UTC qu'oxygen_daily

export const useOxygenCheckinsStore = defineStore('oxygenCheckins', () => {
  const todayCheckin = ref(null)
  const history = ref([])        // 30 j glissants, date asc — nourrit série + divergence
  const historyLoaded = ref(false)
  const saving = ref(false)

  async function loadHistory30() {
    const auth = useAuthStore()
    const userId = auth.user?.id
    if (!userId) return
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('oxygen_checkins')
      .select('date, energy, mood, felt_load, word')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: true })
    if (error) { console.error('[oxygen] checkins history failed:', error.message); return }
    history.value = data || []
    todayCheckin.value = history.value.find(c => c.date === todayStr()) || null
    historyLoaded.value = true
  }

  async function upsertToday({ energy, mood, feltLoad, word }) {
    if (saving.value) return { error: 'busy' }
    const auth = useAuthStore()
    const userId = auth.user?.id
    if (!userId) return { error: 'not_authenticated' }
    // Garde anti-vide (B-10b) : jamais écrire une valeur hors bornes ou absente
    const ok = v => Number.isInteger(v) && v >= 1 && v <= 5
    if (!ok(energy) || !ok(mood) || !ok(feltLoad)) {
      console.warn('[oxygen] checkin SKIP: valeurs hors bornes 1-5')
      return { error: 'invalid' }
    }
    saving.value = true
    try {
      const payload = JSON.parse(JSON.stringify({
        user_id: userId,
        organization_id: auth.profile?.organization_id ?? null,
        date: todayStr(),
        energy,
        mood,
        felt_load: feltLoad,
        word: (word || '').trim().slice(0, 80),
        updated_at: new Date().toISOString(),
      }))
      console.log('[oxygen] checkin payload:', JSON.stringify(payload))
      const { data, error } = await withWrite(
        () => supabase.from('oxygen_checkins')
          .upsert(payload, { onConflict: 'user_id,date' })
          .select(),
        { label: 'oxygen.checkins.upsert' }
      )
      if (error) { console.error('[oxygen] checkin upsert failed:', error.message || error); return { error } }
      const row = data && data[0]
      if (!row) { console.warn('[oxygen] checkin: aucune ligne retournée'); return { error: 'no_row' } }
      // État local APRÈS écriture confirmée
      todayCheckin.value = row
      const i = history.value.findIndex(c => c.date === row.date)
      if (i >= 0) history.value.splice(i, 1, row); else history.value.push(row)
      // L'indice du jour devient calculable → persisté dans oxygen_daily (force)
      await useOxygenDailyStore().upsertToday({ force: true })
      return { success: true }
    } catch (e) {
      console.error('[oxygen] checkin upsert failed:', e.message || e)
      return { error: e.message || 'unknown' }
    } finally { saving.value = false }
  }

  return { todayCheckin, history, historyLoaded, saving, loadHistory30, upsertToday }
})
