<template>
<div class="dashboard">
<DashHeader :greeting="auth.greeting" :first-name="auth.profile?.first_name" :plan-label="auth.company?.planLabel" :role-label="auth.roleLabel" :formatted-date="formattedDate" />

<EmptyState v-if="clients.clients.length === 0" icon="📊" title-key="empty_dashboard_title" desc-key="empty_dashboard_desc" cta-key="empty_dashboard_cta" :cta-action="() => $router.push('/app/portfolio')" />

<template v-else>
<DashKpiSection :visible-kpis="visibleKpis" :periods="periods" :compare-period="snapStore.comparePeriod" :can-customize="canCustomizeKpis" @customize="customizerOpen = true" @period-change="snapStore.comparePeriod = $event" />

<AiInsightPanel module="dashboard" :title="t('ai_dashboard_title')" :button-label="t('ai_dashboard_btn')" :message="t('ai_dashboard_prompt')" />

<div class="dashboard_columns">
<!-- COUNT-353-352: displayed total = clientsOnly, same base as healthy/watch/critical -->
<DashWatchAccounts :watch-accounts="watchAccounts" :healthy-arc="healthyArc" :watch-arc="watchArc" :critical-arc="criticalArc" :circumference="circumference" :total-clients="clients.clientsOnly.length" :healthy-count="clients.healthyCount" :watch-count="clients.watchCount" :critical-count="clients.criticalCount" />
<DashMyTasks :filtered-tasks="filteredTasks" :task-tabs="taskTabs" :active-tab="activeTaskTab" :clients-map="clientsMap" @tab-change="activeTaskTab = $event" />
</div>

<DashQuickActions />
<KpiCustomizer :open="customizerOpen" page-id="dashboard" :defaults="defaultKpis" v-model="selectedKpis" @close="customizerOpen = false" />
</template>
</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { hasFeature } from '@/config/plans.config.js'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { useSnapshotStore } from '@/stores/snapshots'
import { useQuoteStore } from '@/stores/quotes'
import { useClientMetricsStore } from '@/stores/clientMetrics'
import { KPI_CATALOG, KPI_CATEGORIES } from '@/config/kpis'
import KpiCustomizer from '@/components/KpiCustomizer.vue'
import DashHeader from '@/components/dashboard/DashHeader.vue'
import DashKpiSection from '@/components/dashboard/DashKpiSection.vue'
import DashWatchAccounts from '@/components/dashboard/DashWatchAccounts.vue'
import DashMyTasks from '@/components/dashboard/DashMyTasks.vue'
import DashQuickActions from '@/components/dashboard/DashQuickActions.vue'
import AiInsightPanel from '@/components/ai/AiInsightPanel.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fmtKpiValue } from '@/lib/formatters'

const { t, locale } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const clients = useClientStore()
const tasks = useTaskStore()
const snapStore = useSnapshotStore()
const quoteStore = useQuoteStore()
const metricsStore = useClientMetricsStore()
// Auto KPIs derived from quotes + manual aggregates: loaded on mount (idempotent)
if (!quoteStore.quotes.length) quoteStore.loadQuotes()
metricsStore.loadAll()
const canCustomizeKpis = computed(() => hasFeature(auth.effectivePlan, 'advancedDashboardKpis'))

const customizerOpen = ref(false)
const defaultKpis = ['arr', 'health_score', 'churn_rate', 'nps', 'nrr', 'active_users']
const selectedKpis = ref(JSON.parse(localStorage.getItem('scalyo_dashboard_kpis') || 'null') || [...defaultKpis])
watch(selectedKpis, (val) => { localStorage.setItem('scalyo_dashboard_kpis', JSON.stringify(val)) })

const periods = [{ key: '7d', label: 'period_7d' }, { key: '30d', label: 'period_30d' }, { key: '90d', label: 'period_90d' }]
const LOCALE_MAP = { ko: 'ko-KR', en: 'en-US', fr: 'fr-FR' }
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

const formattedDate = computed(() => {
  const d = new Date()
  return d.toLocaleDateString(LOCALE_MAP[locale.value] || 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})

const currentPeriodDays = computed(() => PERIOD_DAYS[snapStore.comparePeriod] || 30)

// Get beginning-of-period ARR from snapshot (for real NRR)
const beginningArr = computed(() => {
  const past = snapStore.getSnapshot(snapStore.comparePeriod)
  return past?.arr || null
})


// Catalog-based KPI config (source: config/kpis.js)
const kpiById = Object.fromEntries(KPI_CATALOG.map(k => [k.id, k]))
const categoryById = Object.fromEntries(KPI_CATEGORIES.map(c => [c.id, c]))
const DATA_SOURCES = computed(() => ({
  arr: clients.totalArr,
  health_score: clients.avgHealth,
  churn_rate: clients.getChurnRate(currentPeriodDays.value),
  nps: clients.avgNps,
  nrr: clients.getNrr(beginningArr.value, currentPeriodDays.value),
  active_users: clients.activeCount,
  // client_metrics batch (contract 22/07) — 8 auto-derived values (R21 formulas, never entered by hand):
  mrr: clients.totalMrr,
  revenue_total: quoteStore.wonTotal,          // Σ won quotes org-wide (= org-wide signed revenue)
  pipeline_value: quoteStore.pipelineTotal,    // Σ draft + sent quotes
  win_rate: quoteStore.winRate,                // won/(won+lost) — null if 0 closed
  new_clients: clients.getNewClients(currentPeriodDays.value),
  accounts_per_csm: clients.csmLoadStats.accountsPerCsm,
  arr_per_csm: clients.csmLoadStats.arrPerCsm,
  tasks_completion: tasks.completionRate,
  // Manual KPIs: org-wide aggregate of the monthly measurements entered on client records
  // (the store produces ONLY source:'manual' ids — no collision possible)
  ...metricsStore.orgAggregates,
}))
const WARN_RULES = { health_score: { below: 5 }, churn_rate: { above: 10 }, nps: { below: 30 }, nrr: { below: 85 } }

// B-10: the day's snapshot must be sent EVEN when the clients are already loaded on
// mount (loadAllStores at login = nominal case) — the old watch {once} without immediate
// never fired in that case → no history → variations always empty.
// immediate:true + manual flag (no stop() inside its own callback, the watch-once trap).
// Placed AFTER DATA_SOURCES: the immediate callback is synchronous with setup (TDZ otherwise).
let snapshotSaved = false
watch(() => clients.clients.length, (len) => {
  if (snapshotSaved || !len) return
  snapshotSaved = true
  snapStore.saveSnapshot?.(DATA_SOURCES.value)
}, { immediate: true })

const visibleKpis = computed(() => {
return selectedKpis.value.map(id => {
const kpi = kpiById[id]
if (!kpi) return null
const categoryIcon = categoryById[kpi.category]?.icon || '📊'
const currentValue = DATA_SOURCES.value[id] ?? null
// HEALTH-SCALE: a score carries its scale at render time ("6,4/10", "4,2/7") — the catalog
// declared it (unit) but the tile did not display it, hence "6,4" with no frame of reference.
const unit = kpi.format === 'score' && kpi.unit && currentValue != null ? kpi.unit : ''
const display = fmtKpiValue(currentValue, kpi.format) + unit
const lowerIsBetter = !!kpi.inverse
const change = currentValue != null ? snapStore.calcChange(id, currentValue, snapStore.comparePeriod, lowerIsBetter) : null
const rule = WARN_RULES[id]
const warn = rule && currentValue != null ? (rule.above != null ? currentValue > rule.above : rule.below != null ? currentValue < rule.below : false) : false
const label = t(kpi.label) // KPI-I18N (04/09): the catalog carries the i18n key
// B-06: calcChange contract = {value,type,hasData} — the badge displays value ("+X%") and is colored by type (the old mapping read non-existent label/class → empty, always-neutral badge)
return { id, icon: categoryIcon, label, display, warn, change: change?.value ?? null, changeLabel: change?.value ?? '', changeClass: change?.type ?? 'neutral' }
}).filter(Boolean)
})

// local formatKpiValue extracted into lib/formatters.fmtKpiValue (single source,
// shared by the client record + copil wizard — client_metrics batch 22/07, R25 §3)

const circumference = (2 * Math.PI * 52).toFixed(1)
// COUNT-353-352 (29/08): same base as the store counters (healthy/watch/critical =
// clientsOnly, prospects excluded) — the donut divided 352 segments by a total of 353,
// and the watchlist could list a "critical" prospect with no health data.
const total = computed(() => clients.clientsOnly.length || 1)
const healthyArc = computed(() => ((clients.healthyCount / total.value) * circumference).toFixed(1))
const watchArc = computed(() => ((clients.watchCount / total.value) * circumference).toFixed(1))
const criticalArc = computed(() => ((clients.criticalCount / total.value) * circumference).toFixed(1))

const watchAccounts = computed(() =>
  clients.clientsOnly.filter(c => clients.getEffectiveStatus(c) !== 'healthy').sort((a, b) => (a.health || 0) - (b.health || 0)).slice(0, 5)
)

const myTasks = computed(() => {
  const u = auth.user; if (!u) return []
  return tasks.tasks.filter(task => { const a = String(task.assignee).toLowerCase(); return a === u.id || a === u.firstName?.toLowerCase() || a === u.displayName?.toLowerCase() || a === u.email?.toLowerCase() })
})
const activeTaskTab = ref('all')
const taskTabs = computed(() => [
  { key: 'all', label: 'task_all', count: myTasks.value.length },
  { key: 'in_progress', label: 'task_in_progress', count: myTasks.value.filter(t => t.status === 'in_progress').length },
  { key: 'todo', label: 'task_todo', count: myTasks.value.filter(t => t.status === 'todo').length },
  { key: 'blocked', label: 'task_blocked', count: myTasks.value.filter(t => t.status === 'blocked').length }
])
const filteredTasks = computed(() => {
  const list = activeTaskTab.value === 'all' ? myTasks.value : myTasks.value.filter(t => t.status === activeTaskTab.value)
  return list.slice(0, 8)
})
const clientsMap = computed(() => { const map = {}; clients.clients.forEach(c => { map[c.id] = c.name }); return map })

</script>

<style scoped>
.dashboard { max-width: 1200px; }
.dashboard_columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px; }
@media (max-width: 768px) { .dashboard_columns { grid-template-columns: 1fr; } }
</style>
