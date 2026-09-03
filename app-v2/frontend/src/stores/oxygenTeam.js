import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

// ─── OXYGEN Lot 4 — team loop (contract R23 approved 29/07/2026) ────────────
// A SINGLE source: the SQL function oxygen_team_aggregate (SECURITY DEFINER,
// threshold n ≥ 5 literal in the body, owner-only, fail-closed org flag — E14).
// The front end NEVER reads other people's oxygen tables and does not know the flag:
// it displays the state the function returns (forbidden/disabled/insufficient/ok).
// No individual data travels — the payload only contains team
// averages. NO text here (t() forbidden in a store — the view renders everything).

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
