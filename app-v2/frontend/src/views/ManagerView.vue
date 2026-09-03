<template>
  <div class="manager">
    <!-- HEADER -->
    <div class="mgr-header">
      <div>
        <div class="manager-header-row">
          <h1>👥 {{ t('mgr_title') }}</h1>
        </div>
        <p class="mgr-date">{{ formattedDate }}</p>
      </div>
      <div class="mgr-header-actions">
        <button v-if="canCustomizeKpis" class="btn-customize" @click="customizerOpen = true">
          ⚙ {{ t('kpi_cust_title') }}
        </button>
      </div>
      <div class="mgr-kpis-top">
        <div class="mkpi">
          <span class="mkpi-value" :class="healthClass">{{ team.teamHealthScore ?? '—' }}</span>
          <span class="mkpi-label">{{ t('mgr_global_health') }}</span>
        </div>
        <div class="mkpi">
          <!-- TEAM-METRICS (29/08) : « ARR géré » = somme réelle des ARR des clients ASSIGNÉS
               (csm_id posé), dérivée du store clients — team.totalArrManaged est null par design B-09 -->
          <span class="mkpi-value">{{ fmtCurrency(arrManagedTotal, { compact: true }) }}</span>
          <span class="mkpi-label">{{ t('mgr_total_arr') }}</span>
        </div>
        <div class="mkpi">
          <!-- COUNT-353-352 : clients ACTIFS (prospects exclus) — même base que le donut Dashboard -->
          <span class="mkpi-value">{{ clients.clientsOnly.length }}</span>
          <span class="mkpi-label">{{ t('mgr_total_clients') }}</span>
        </div>
        <div class="mkpi">
          <!-- SEATS-MISMATCH : même source que l'écran Équipe (/api/members + plafond du plan) -->
          <span class="mkpi-value" :class="{ 'text-orange': team.seatsCap !== null && team.seats.used >= team.seatsCap }">{{ team.seats.used ?? '—' }}/{{ team.seatsCap === null ? '∞' : team.seatsCap }}</span>
          <span class="mkpi-label">{{ t('mgr_seats') }}</span>
        </div>
      </div>
    </div>

    <!-- OXYGEN Lot 4 : onglets locaux (Équipe | Oxygen) — zéro route neuve, router intouché -->
    <div class="mgr-tabs">
      <button class="mgr-tab" :class="{ active: tab === 'team' }" @click="tab = 'team'">
        {{ t('mgr_tab_team') }}
      </button>
      <!-- D2 : hors forfait → cadenas, clic vers paywall mode upgrade -->
      <button v-if="oxygenTeamLocked" class="mgr-tab mgr-tab--locked" @click="goOxygenPaywall">
        🫧 {{ t('mgr_tab_oxygen') }} <span class="mgr-tab-lock">🔒</span>
      </button>
      <button v-else class="mgr-tab" :class="{ active: tab === 'oxygen' }" @click="tab = 'oxygen'">
        🫧 {{ t('mgr_tab_oxygen') }}
      </button>
    </div>

    <!-- ONGLET OXYGEN — boucle équipe (agrégats n≥5 uniquement) -->
    <OxygenTeamPanel v-if="tab === 'oxygen' && !oxygenTeamLocked" />

    <!-- FILTERS -->
    <div v-if="tab === 'team'" class="mgr-filters">
      <select v-model="filterCsm" class="filter-select">
        <option value="all">{{ t('mgr_filter_all_csm') }}</option>
        <option v-for="m in team.statsMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <select v-model="filterLevel" class="filter-select">
        <option value="all">{{ t('mgr_filter_all_levels') }}</option>
        <option v-for="role in uniqueRoles" :key="role" :value="role">{{ role }}</option>
      </select>
      <select v-model="filterStatus" class="filter-select">
        <option value="all">{{ t('mgr_filter_all_statuses') }}</option>
        <option value="healthy">{{ t('status_healthy') }}</option>
        <option value="overloaded">{{ t('kpi_overloaded') }}</option>
      </select>
    </div>

    <!-- WELLBEING -->
    <ManagerWellbeing v-if="tab === 'team'" :members="filteredMembers" />

    <!-- TWO COLUMNS -->
    <div v-if="tab === 'team'" class="mgr-columns">
      <ManagerPerformance :members="filteredMembers" />
      <ManagerPortfolio />
    </div>

    <KpiCustomizer
      :open="customizerOpen"
      page-id="manager"
      :defaults="defaultKpis"
      v-model="selectedKpis"
      @close="customizerOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { useClientStore } from '@/stores/clients'
import { hasFeature } from '@/config/plans.config.js'
import { isModuleAllowed } from '@/utils/planGating'
import KpiCustomizer from '@/components/KpiCustomizer.vue'
import ManagerWellbeing from '@/components/manager/ManagerWellbeing.vue'
import ManagerPerformance from '@/components/manager/ManagerPerformance.vue'
import ManagerPortfolio from '@/components/manager/ManagerPortfolio.vue'
import OxygenTeamPanel from '@/components/oxygen/OxygenTeamPanel.vue'
import { fmtCurrency } from '@/lib/formatters'
import '@/assets/manager.css'

const { t, locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const team = useTeamStore()
const auth = useAuthStore()
team.loadSeats()
const clients = useClientStore()

// OXYGEN Lot 4 — onglet local (contrat R23 : pas de route neuve)
const tab = ref('team')
const oxygenTeamLocked = computed(() => !isModuleAllowed(auth.effectivePlan, 'oxygen_team'))
function goOxygenPaywall() {
  router.push({ name: 'paywall', query: { reason: 'upgrade', module: 'oxygen_team' } })
}

const customizerOpen = ref(false)
const canCustomizeKpis = computed(() => hasFeature(auth.effectivePlan, 'dashboardKPIsAvances'))
const defaultKpis = ['team_wellbeing', 'arr', 'churn_rate', 'accounts_per_csm', 'nrr', 'health_score']
const selectedKpis = ref([...defaultKpis])

const filterCsm = ref('all')
const filterLevel = ref('all')
const filterStatus = ref('all')

const formattedDate = computed(() => {
  const loc = locale.value === 'ko' ? 'ko-KR' : locale.value === 'en' ? 'en-US' : 'fr-FR'
  return new Date().toLocaleDateString(loc, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
})

// B-09 : pas de donnée → pas de couleur
const healthClass = computed(() => {
  const s = team.teamHealthScore
  if (typeof s !== 'number') return ''
  return s >= 70 ? 'green' : s >= 50 ? 'amber' : 'red'
})

// TEAM-METRICS (D2, 29/08) : statsMembers = self-inclusif — un manager-CSM voit aussi ses chiffres
const filteredMembers = computed(() =>
  team.statsMembers.filter(m => {
    if (filterCsm.value !== 'all' && m.id !== filterCsm.value) return false
    if (filterLevel.value !== 'all' && m.role !== filterLevel.value) return false
    // statusLabel honnête (m.status n'a jamais existé — E-16) ; null = pas de donnée → exclu des filtres ciblés
    if (filterStatus.value === 'overloaded' && m.statusLabel !== 'overloaded') return false
    if (filterStatus.value === 'healthy' && (!m.statusLabel || m.statusLabel === 'overloaded')) return false
    return true
  })
)

const uniqueRoles = computed(() =>
  [...new Set(team.statsMembers.map(m => m.role))]
)

// TEAM-METRICS (29/08) : ARR géré total = clients actifs assignés (csm_id posé), R21
const arrManagedTotal = computed(() =>
  clients.clientsOnly.filter(c => c.csmId).reduce((s, c) => s + (c.arr || 0), 0)
)

// B-08 : reset global retiré (ne supprimait rien en base, i18n cassé). Reset clients propre = PortfolioView.

</script>
