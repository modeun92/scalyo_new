import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

// ─── OXYGEN Lot 4 — boucle équipe (contrat R23 validé 29/07/2026) ────────────
// UNE seule source : la fonction SQL oxygen_team_aggregate (SECURITY DEFINER,
// seuil n ≥ 5 littéral dans le corps, owner-only, flag org fail-closed — E14).
// Le front ne lit JAMAIS les tables oxygen d'autrui et ne connaît pas le flag :
// il affiche l'état que la fonction retourne (forbidden/disabled/insufficient/ok).
// Aucune donnée individuelle ne transite — le payload ne contient que des
// moyennes d'équipe. AUCUN texte ici (t() interdit en store — la vue rend tout).

export const useOxygenTeamStore = defineStore('oxygenTeam', () => {
  const status = ref('idle') // idle | loading | ok | insufficient | disabled | forbidden | error
  const data = ref(null)     // { n, window_days, workdays, current, previous } quand status === 'ok'

  async function load() {
    const auth = useAuthStore()
    const orgId = auth.profile?.organization_id
    if (!orgId) { status.value = 'error'; data.value = null; return }
    status.value = 'loading'
    const { data: res, error } = await supabase.rpc('oxygen_team_aggregate', { p_org: orgId })
    if (error) {
      console.error('[oxygen] team aggregate failed:', error.message || error)
      status.value = 'error'; data.value = null; return
    }
    const st = res && res.status
    if (st === 'ok') { data.value = res; status.value = 'ok' }
    else if (st === 'insufficient' || st === 'disabled' || st === 'forbidden') {
      data.value = null; status.value = st
    } else {
      console.warn('[oxygen] team aggregate: statut inattendu', JSON.stringify(res))
      data.value = null; status.value = 'error'
    }
  }

  return { status, data, load }
})
