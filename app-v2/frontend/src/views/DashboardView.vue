<template>
<div class="dashboard">
<DashHeader :greeting="auth.greeting" :first-name="auth.profile?.first_name" :plan-label="auth.company?.planLabel" :role-label="auth.roleLabel" :formatted-date="formattedDate" />

<EmptyState v-if="clients.clients.length === 0" icon="📊" title-key="empty_dashboard_title" desc-key="empty_dashboard_desc" cta-key="empty_dashboard_cta" :cta-action="() => $router.push('/app/portfolio')" />

<template v-else>
<DashKpiSection :visible-kpis="visibleKpis" :periods="periods" :compare-period="snapStore.comparePeriod" :can-customize="canCustomizeKpis" @customize="customizerOpen = true" @period-change="snapStore.comparePeriod = $event" />

<AiInsightPanel module="dashboard" :title="t('ai_dashboard_title')" :button-label="t('ai_dashboard_btn')" :message="t('ai_dashboard_prompt')" />

<div class="dash-columns">
<!-- COUNT-353-352 : total affiché = clientsOnly, même base que healthy/watch/critical -->
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
import { KPI_CATALOG, KPI_CATEGORIES } from '@/data/kpiCatalog'
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
// KPIs auto dérivés des devis + agrégats manuels : chargés au montage (idempotent)
if (!quoteStore.quotes.length) quoteStore.loadQuotes()
metricsStore.loadAll()
const canCustomizeKpis = computed(() => hasFeature(auth.effectivePlan, 'dashboardKPIsAvances'))

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


// Catalog-based KPI config (source: kpiCatalog.js)
const catalogMap = Object.fromEntries(KPI_CATALOG.map(k => [k.id, k]))
const categoryMap = Object.fromEntries(KPI_CATEGORIES.map(c => [c.id, c]))
const DATA_SOURCES = computed(() => ({
  arr: clients.totalArr,
  health_score: clients.avgHealth,
  churn_rate: clients.getChurnRate(currentPeriodDays.value),
  nps: clients.avgNps,
  nrr: clients.getNrr(beginningArr.value, currentPeriodDays.value),
  active_users: clients.activeCount,
  // Lot client_metrics (contrat 22/07) — 8 dérivés auto (formules R21, jamais saisis) :
  mrr: clients.totalMrr,
  revenue_total: quoteStore.wonTotal,          // Σ devis gagnés org (= CA signée org-wide)
  pipeline_value: quoteStore.pipelineTotal,    // Σ devis brouillon + envoyés
  win_rate: quoteStore.winRate,                // gagnés/(gagnés+perdus) — null si 0 clos
  new_clients: clients.getNewClients(currentPeriodDays.value),
  accounts_per_csm: clients.csmLoadStats.accountsPerCsm,
  arr_per_csm: clients.csmLoadStats.arrPerCsm,
  tasks_completion: tasks.completionRate,
  // KPIs manuels : agrégat org des mesures mensuelles saisies sur les fiches client
  // (le store ne produit QUE des ids source:'manual' — aucune collision possible)
  ...metricsStore.orgAggregates,
}))
const WARN_RULES = { health_score: { below: 5 }, churn_rate: { above: 10 }, nps: { below: 30 }, nrr: { below: 85 } }

// B-10 : le snapshot du jour doit partir MÊME quand les clients sont déjà chargés au
// montage (loadAllStores au login = cas nominal) — l'ancien watch {once} sans immediate
// ne se déclenchait jamais dans ce cas → aucun historique → variations toujours vides.
// immediate:true + flag manuel (pas de stop() dans son propre callback, piège watch-once).
// Placé APRÈS DATA_SOURCES : le callback immediate est synchrone au setup (TDZ sinon).
let snapshotSaved = false
watch(() => clients.clients.length, (len) => {
  if (snapshotSaved || !len) return
  snapshotSaved = true
  snapStore.saveSnapshot?.(DATA_SOURCES.value)
}, { immediate: true })

const visibleKpis = computed(() => {
return selectedKpis.value.map(id => {
const cat = catalogMap[id]
if (!cat) return null
const catIcon = categoryMap[cat.cat]?.icon || '📊'
const currentValue = DATA_SOURCES.value[id] ?? null
// HEALTH-SCALE : un score porte son échelle au rendu (« 6,4/10 », « 4,2/7 ») — le catalogue
// la déclarait (unit) mais la tuile ne l'affichait pas, d'où « 6,4 » sans repère.
const unit = cat.format === 'score' && cat.unit && currentValue != null ? cat.unit : ''
const display = fmtKpiValue(currentValue, cat.format) + unit
const lowerIsBetter = !!cat.inverse
const change = currentValue != null ? snapStore.calcChange(id, currentValue, snapStore.comparePeriod, lowerIsBetter) : null
const rule = WARN_RULES[id]
const warn = rule && currentValue != null ? (rule.above != null ? currentValue > rule.above : rule.below != null ? currentValue < rule.below : false) : false
const label = locale.value === 'en' ? (cat.labelEN || cat.label) : locale.value === 'ko' ? (cat.labelKO || cat.label) : cat.label
// B-06 : contrat calcChange = {value,type,hasData} — le badge affiche value (« +X% ») et se colore par type (l'ancien mapping lisait label/class inexistants → badge vide toujours neutre)
return { id, icon: catIcon, label, display, warn, change: change?.value ?? null, changeLabel: change?.value ?? '', changeClass: change?.type ?? 'neutral' }
}).filter(Boolean)
})

// formatKpiValue local extrait vers lib/formatters.fmtKpiValue (source unique,
// partag\u00e9 fiche client + wizard copil \u2014 lot client_metrics 22/07, R25 \u00a73)

const circumference = (2 * Math.PI * 52).toFixed(1)
// COUNT-353-352 (29/08) : même base que les compteurs du store (healthy/watch/critical =
// clientsOnly, prospects exclus) — le donut divisait 352 segments par un total de 353,
// et la watchlist pouvait lister un prospect « critique » sans donnée de santé.
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
.dash-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px; }
@media (max-width: 768px) { .dash-columns { grid-template-columns: 1fr; } }
</style>
