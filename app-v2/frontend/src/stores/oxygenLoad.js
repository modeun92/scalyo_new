import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from './auth'
import { useClientStore } from './clients'
import { useTaskStore } from './tasks'
import { useNotificationStore } from './notifications'
import { usePlaybookStore } from './playbooks'

// ─── OXYGEN Lot 1 — charge objective (contrat R23 validé 28/07/2026) ─────────
// Lecture PURE des stores existants — aucune requête propre, aucun store modifié (D-8).
// Formule D-2 option A : critiques ×20 (cap 40) · renouvellements 30 j ×10 (cap 30)
// · tâches en retard ×5 (cap 15) · alertes 7 j ×5 (cap 10) · playbooks actifs ×2,5 (cap 5).
// D-3 : « alertes » = types réels churn_risk + nps_drop ciblant SES clients assignés.
// Garde R21 : csm non assigné → composantes portefeuille = 0 — jamais un chiffre inventé.

export const useOxygenLoadStore = defineStore('oxygenLoad', () => {
  const auth = useAuthStore()
  const clientStore = useClientStore()
  const taskStore = useTaskStore()
  const notificationStore = useNotificationStore()
  const playbookStore = usePlaybookStore()

  const userId = computed(() => auth.user?.id || null)

  // Clients actifs assignés au user courant (csm_id posé — B-04 ; prospects exclus)
  const assignedClients = computed(() => {
    if (!userId.value) return []
    return clientStore.clientsOnly.filter(c => c.csmId === userId.value)
  })
  const assignedClientIds = computed(() => new Set(assignedClients.value.map(c => c.id)))

  // C1 — comptes critiques assignés (statut effectif : status='critical' OU health ≤ 3)
  const criticalAssigned = computed(() =>
    assignedClients.value.filter(c => clientStore.getEffectiveStatus(c) === 'critical').length
  )

  // C2 — renouvellements ≤ 30 j sur clients assignés (pattern renewalsNext30, B-05)
  const renewals30 = computed(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now.getTime() + 30 * 86400000)
    return assignedClients.value.filter(c => {
      if (!c.renewalDate) return false
      const d = new Date(c.renewalDate)
      return !Number.isNaN(d.getTime()) && d >= now && d <= limit
    }).length
  })

  // C3 — tâches en retard du user (pattern overdueTasks : end_date passée, non finies)
  const overdue = computed(() => taskStore.overdueTasks.length)

  // C4 — alertes 7 j : churn_risk + nps_drop (D-3) ciblant SES clients assignés.
  // renewal / task_overdue exclus : déjà portés par C2 / C3 (zéro double compte).
  const alerts7 = computed(() => {
    if (!userId.value) return 0
    const since = Date.now() - 7 * 86400000
    return notificationStore.notifications.filter(n =>
      (n.type === 'churn_risk' || n.type === 'nps_drop') &&
      n.created_at && new Date(n.created_at).getTime() >= since &&
      n.target_id && assignedClientIds.value.has(n.target_id)
    ).length
  })

  // C5 — playbooks actifs sur SES clients assignés
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

  // load_score 0-100, borné par composante puis globalement
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
