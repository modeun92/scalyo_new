import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { getMaxSeats } from '@/config/plans.config.js'
import { useAuthStore } from './auth'

export const useTeamStore = defineStore('team', () => {
  const members = ref([])
  const loading = ref(false)
  const lastError = ref(null)

  // ─── Computed ────────────────────────────────────────
  // B-09: NO more invented metrics. null = "no data" → rendered as '—'.
  // The aggregates only count members that HAVE a real value; as long
  // as no real source exists (wellbeing = confidential, load = not
  // measured, clients/ARR = blocked by B-04), they return null, never a figure.
  const wellbeingData = computed(() => members.value.filter(m => typeof m.wellbeingScore === 'number'))
  const workloadData = computed(() => members.value.filter(m => typeof m.workload === 'number'))
  const hasWellbeingData = computed(() => wellbeingData.value.length > 0)
  const hasWorkloadData = computed(() => workloadData.value.length > 0)
  const teamHealthScore = computed(() => {
    if (!wellbeingData.value.length) return null
    return Math.round(wellbeingData.value.reduce((s, m) => s + m.wellbeingScore, 0) / wellbeingData.value.length)
  })
  const healthyMembers = computed(() => workloadData.value.filter(m => m.workload < 80))
  const overloadedMembers = computed(() => workloadData.value.filter(m => m.workload >= 80))
  const totalArrManaged = computed(() => {
    const withArr = members.value.filter(m => typeof m.arrManaged === 'number')
    if (!withArr.length) return null
    return withArr.reduce((s, m) => s + m.arrManaged, 0)
  })
  // SEATS-MISMATCH (25/08): the SINGLE SOURCE for seats = /api/members (used = non-viewer members
  // + pending invitations, computed server-side) and the ceiling = the plan (plans.config.getMaxSeats).
  // The old `seatsUsed = members.length + 1` / `profile.seats_paid || 1` produced "5/1" on
  // Manager (a Member's profile → 1) against "5 / 24" on the Team screen.
  const seats = ref({ used: null, paid: null })
  const seatsCap = computed(() => getMaxSeats(useAuthStore().currentPlan)) // null = unlimited (Enterprise)
  async function loadSeats() {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      const resp = await fetch('/api/members', { headers: { Authorization: 'Bearer ' + token } })
      if (!resp.ok) return
      const data = await resp.json()
      if (data?.seats) seats.value = { used: data.seats.used ?? null, paid: data.seats.paid ?? null }
    } catch (err) {
      if (window.Sentry) window.Sentry.captureException(err)
    }
  }

  function calcBurnoutRisk(member) {
    const wl = member.workload
    const wb = member.wellbeingScore
    if (typeof wl !== 'number' || typeof wb !== 'number') return null
    if (wl >= 90 && wb < 50) return 'high'
    if (wl >= 80 || wb < 60) return 'low'
    return 'none'
  }

  const enrichedMembers = computed(() => members.value.map(m => ({
    ...m,
    burnoutRisk: calcBurnoutRisk(m),
    statusLabel: typeof m.workload !== 'number' ? null : (m.workload >= 90 ? 'overloaded' : m.workload >= 75 ? 'loaded' : 'good'),
  })))

  // TEAM-METRICS (D2, 29/08): self-inclusive STATS list — a manager-CSM also sees
  // their own figures (otherwise their assigned clients appear under nobody when
  // they look at Manager/Health Tracker). G9-10 (excluding the current user) stays the rule
  // for `members`/`enrichedMembers` (team management, invitations). The self entry carries the
  // same B-09 fields (null = no data, never an invented figure).
  const statsMembers = computed(() => {
    const auth = useAuthStore()
    if (!auth.user?.id) return enrichedMembers.value
    const self = {
      id: auth.user.id, name: selfName(), email: '',
      role: auth.profile?.org_role || 'owner', self: true,
      wellbeingScore: null, workload: null, clientCount: null, arrManaged: null,
      moodHistory: [], canSendEmail: false,
      burnoutRisk: null, statusLabel: null,
    }
    return [self, ...enrichedMembers.value]
  })

  // ─── Self-inclusive lists (G9-10) ──────────────────────────────
  // `members` deliberately excludes the current user (manager stats assume self
  // is separate). But assignment surfaces (task assignee, OKR owner, client CSM)
  // MUST let the owner pick themselves. assignableMembers = self + members, and
  // memberName() resolves self too (otherwise self-assigned rows show '?').
  function selfName() {
    const auth = useAuthStore()
    return [auth.profile?.first_name, auth.profile?.last_name].filter(Boolean).join(' ') || auth.user?.email || ''
  }
  const assignableMembers = computed(() => {
    const auth = useAuthStore()
    if (!auth.user?.id) return members.value
    const self = { id: auth.user.id, name: selfName(), role: auth.profile?.org_role || 'owner', self: true }
    return [self, ...members.value]
  })
  function memberName(id) {
    if (!id) return ''
    const auth = useAuthStore()
    if (auth.user?.id === id) return selfName()
    return members.value.find(m => m.id === id)?.name || ''
  }

  // ─── Load ─────────────────────────────────────────────────────
  async function loadMembers() {
    loading.value = true
    lastError.value = null
    try {
      const authStore = useAuthStore()
      if (!authStore.profile?.organization_id) { members.value = []; return }
      // CORE-V2-ME (04/10/2026): the colleagues come from core_v2 (core_v2_my_team, 20261004100000),
      // names included. Read from organization_members + profiles, every name came back EMPTY:
      // profiles RLS is self-only, so the second query only ever returned the caller's own row.
      // The caller is left out by the RPC (self stays apart, G9-10); ENDED workers are not listed.
      const { data, error } = await supabase.rpc('core_v2_my_team')
      if (error) throw error
      members.value = (Array.isArray(data) ? data : []).filter(m => m.user_id).map(m => ({
        id: m.user_id,
        name: [m.first_name, m.last_name].filter(Boolean).join(' ') || '',
        email: '', role: m.role || 'member',
        jobStatus: m.job_status || null,
        // B-09: null = no real data (never an invented 75/60/0)
        wellbeingScore: null, workload: null,
        clientCount: null, arrManaged: null,
        // CR-8 (C-05): real value read from the database — the owner toggle reflects reality
        moodHistory: [], canSendEmail: m.can_send_email ?? false,
      }))
    } catch (err) {
      lastError.value = err.message || 'Failed to load team members'
      if (window.Sentry) window.Sentry.captureException(err)
    } finally {
      loading.value = false
    }
  }

  return {
    members, loading, lastError, teamHealthScore, healthyMembers, overloadedMembers,
    hasWellbeingData, hasWorkloadData,
    totalArrManaged, enrichedMembers, statsMembers, assignableMembers, memberName,
    seats, seatsCap, loadSeats, calcBurnoutRisk, loadMembers,
  }
})
