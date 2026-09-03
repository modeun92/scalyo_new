import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from './auth'
import { useClientStore } from './clients'
import { useTaskStore } from './tasks'
import { useNotificationStore } from './notifications'
import { usePlaybookStore } from './playbooks'

// ─── OXYGEN Lot 1 — objective load (contract R23 approved 28/07/2026) ─────────
// PURE read of the existing stores — no query of its own, no store modified (D-8).
// Formula D-2 option A: criticals × 20 (cap 40) · renewals within 30 d × 10 (cap 30)
// · overdue tasks × 5 (cap 15) · alerts within 7 d × 5 (cap 10) · active playbooks × 2.5 (cap 5).
// D-3: "alerts" = the real types churn_risk + nps_drop targeting THEIR assigned clients.
// R21 guard: unassigned CSM → portfolio components = 0 — never an invented figure.

export const useOxygenLoadStore = defineStore('oxygenLoad', () => {
  const auth = useAuthStore()
  const clientStore = useClientStore()
  const taskStore = useTaskStore()
  const notificationStore = useNotificationStore()
  const playbookStore = usePlaybookStore()

  const userId = computed(() => auth.user?.id || null)

  // Active clients assigned to the current user (csm_id set — B-04; prospects excluded)
  const assignedClients = computed(() => {
    if (!userId.value) return []
    return clientStore.clientsOnly.filter(c => c.csmId === userId.value)
  })
  const assignedClientIds = computed(() => new Set(assignedClients.value.map(c => c.id)))

  // C1 — assigned critical accounts (effective status: status='critical' OR health ≤ 3)
  const criticalAssigned = computed(() =>
    assignedClients.value.filter(c => clientStore.getEffectiveStatus(c) === 'critical').length
  )

  // C2 — renewals ≤ 30 d on assigned clients (renewalsNext30 pattern, B-05)
  const renewals30 = computed(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now.getTime() + 30 * 86400000)
    return assignedClients.value.filter(c => {
      if (!c.renewalDate) return false
      const d = new Date(c.renewalDate)
      return !Number.isNaN(d.getTime()) && d >= now && d <= limit
    }).length
  })

  // C3 — the user's overdue tasks (overdueTasks pattern: end_date in the past, not done)
  const overdue = computed(() => taskStore.overdueTasks.length)

  // C4 — alerts within 7 d: churn_risk + nps_drop (D-3) targeting THEIR assigned clients.
  // renewal / task_overdue excluded: already carried by C2 / C3 (zero double counting).
  const alerts7 = computed(() => {
    if (!userId.value) return 0
    const since = Date.now() - 7 * 86400000
    return notificationStore.notifications.filter(n =>
      (n.type === 'churn_risk' || n.type === 'nps_drop') &&
      n.created_at && new Date(n.created_at).getTime() >= since &&
      n.target_id && assignedClientIds.value.has(n.target_id)
    ).length
  })

  // C5 — active playbooks on THEIR assigned clients
  const activePlaybooksAssigned = computed(() =>
    playbookStore.activePlaybooks.filter(p => p.clientId && assignedClientIds.value.has(p.clientId)).length
  )

  const components = computed(() => ({
    critical: criticalAssigned.value,
    renewals30: renewals30.value,
    overdue_tasks: overdue.value,
    alerts7: alerts7.value,
    active_playbooks: activePlaybooksAssigned.value,
  }))

  // load_score 0-100, bounded per component then globally
  const loadScore = computed(() => {
    const s =
      Math.min(criticalAssigned.value * 20, 40) +
      Math.min(renewals30.value * 10, 30) +
      Math.min(overdue.value * 5, 15) +
      Math.min(alerts7.value * 5, 10) +
      Math.min(activePlaybooksAssigned.value * 2.5, 5)
    return Math.min(Math.round(s * 10) / 10, 100)
  })

  return {
    userId, assignedClients, assignedClientIds,
    criticalAssigned, renewals30, overdue, alerts7, activePlaybooksAssigned,
    components, loadScore,
  }
})
