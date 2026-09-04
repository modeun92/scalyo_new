<template>
  <div class="satisfaction">
    <SatHeader
      :globalScore="globalScore"
      :can-customize="canCustomizeKpis"
      @customize="customizerOpen = true"
      @reset="resetFilters"
    />

    <SatFilters
      :statusFilters="statusFilters"
      v-model:activeFilter="activeFilter"
      v-model:csmFilter="csmFilter"
      v-model:sortBy="sortBy"
      v-model:search="search"
      :teamMembers="team.statsMembers"
    />

    <div class="satisfaction_grid">
      <div class="satisfaction_left">
        <SatGaugeCard
          :globalScore="globalScore"
          :gaugeColor="gaugeColor"
          :gaugeArc="gaugeArc"
          :healthyCount="clients.healthyCount"
          :watchCount="clients.watchCount"
          :criticalCount="clients.criticalCount"
          :totalClients="clients.clientsOnly.length"
        />
        <SatArrCards
          :totalArr="clients.totalArr"
          :arrAtRisk="clients.arrAtRisk"
        />
      </div>

      <div class="satisfaction_right">
        <SatHealthList :sortedClients="sortedClients" />
        <SatIndicators
          :renewalsNext30="clients.renewalsNext30"
          :decliningCount="decliningCount"
          :bestCsm="bestCsm"
          :arrAtRisk="clients.arrAtRisk"
        />
      </div>
    </div>

    <KpiCustomizer
      :open="customizerOpen"
      page-id="satisfaction"
      :defaults="defaultKpis"
      v-model="selectedKpis"
      @close="customizerOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useClientStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { hasFeature } from '@/config/plans.config.js'
import { healthStatus, healthColor, healthPct, toHealthNumber } from '@/lib/health'
import KpiCustomizer from '@/components/KpiCustomizer.vue'
import SatHeader from '@/components/satisfaction/SatHeader.vue'
import SatFilters from '@/components/satisfaction/SatFilters.vue'
import SatGaugeCard from '@/components/satisfaction/SatGaugeCard.vue'
import SatArrCards from '@/components/satisfaction/SatArrCards.vue'
import SatHealthList from '@/components/satisfaction/SatHealthList.vue'
import SatIndicators from '@/components/satisfaction/SatIndicators.vue'

import '@/assets/satisfaction.css'

const clients = useClientStore()
const team = useTeamStore()
const auth = useAuthStore()
const canCustomizeKpis = computed(() => hasFeature(auth.effectivePlan, 'advancedDashboardKpis'))

const customizerOpen = ref(false)
const defaultKpis = ['health_score', 'nps', 'churn_rate', 'renewal_rate', 'csat', 'promoters_pct']
const selectedKpis = ref([...defaultKpis])

const activeFilter = ref('all')
const csmFilter = ref('all')
const sortBy = ref('health')
const search = ref('')

const statusFilters = [
  { key: 'all', label: 'sat_filter_all' },
  { key: 'healthy', label: 'sat_filter_healthy' },
  { key: 'watch', label: 'sat_filter_watch' },
  { key: 'risk', label: 'sat_filter_risk' },
]

function resetFilters() {
  activeFilter.value = 'all'
  csmFilter.value = 'all'
  sortBy.value = 'health'
  search.value = ''
}

// HEALTH-SCALE (25/08): filters, global score and decline read the EFFECTIVE status and
// the /10 scale from lib/health — no more raw `c.status` nor ×10 ("10 /100").
const statusOf = (c) => clients.getEffectiveStatus(c)

// COUNT-353-352 (29/08): base = clientsOnly (prospects excluded), same scope as the store
// counters (healthy/watch/critical, arrAtRisk) — a prospect has no measured health.
const filteredClients = computed(() => {
  let list = clients.clientsOnly
  if (activeFilter.value === 'healthy') list = list.filter(c => statusOf(c) === 'healthy')
  else if (activeFilter.value === 'watch') list = list.filter(c => statusOf(c) === 'watch')
  else if (activeFilter.value === 'risk') list = list.filter(c => statusOf(c) !== 'healthy')
  if (csmFilter.value !== 'all') list = list.filter(c => c.csmId === csmFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q))
  }
  return list
})

const sortedClients = computed(() => {
  const list = [...filteredClients.value]
  if (sortBy.value === 'health') list.sort((a, b) => a.health - b.health)
  else if (sortBy.value === 'health_desc') list.sort((a, b) => b.health - a.health)
  else if (sortBy.value === 'arr') list.sort((a, b) => b.arr - a.arr)
  return list
})

// Average score out of 10 (1 decimal), same formula as clients.avgHealth but over the filtered selection
const globalScore = computed(() => {
  if (!filteredClients.value.length) return null
  return parseFloat((filteredClients.value.reduce((s, c) => s + (toHealthNumber(c.health) ?? 0), 0) / filteredClients.value.length).toFixed(1))
})

// Color and thresholds = those of the effective status (3/6), no more local 50/70
const gaugeStatus = computed(() => healthStatus(globalScore.value, null))
const gaugeColor = computed(() => healthColor(gaugeStatus.value))

const gaugeArc = computed(() => ((healthPct(globalScore.value) / 100) * 534.07).toFixed(1))

// "Declining" = any account that is not Healthy (effective status), no more local < 5 threshold
// COUNT-353-352: on active clients only (same base as watchCount + criticalCount)
const decliningCount = computed(() => clients.clientsOnly.filter(c => statusOf(c) !== 'healthy').length)

const bestCsm = computed(() => {
  const csmScores = {}
  // BEST-CSM-VIDE (29/08): accounts WITHOUT a csm_id do not compete — the "empty" group
  // (4 accounts, average 7.0) beat Claire (95 accounts, 6.76) and displayed "—"
  clients.clientsOnly.filter(c => c.csmId).forEach(c => {
    if (!csmScores[c.csmId]) csmScores[c.csmId] = { total: 0, count: 0, name: c.csm }
    csmScores[c.csmId].total += c.health
    csmScores[c.csmId].count++
  })
  let best = null
  let bestAvg = 0
  for (const id in csmScores) {
    const avg = csmScores[id].total / csmScores[id].count
    if (avg > bestAvg) { bestAvg = avg; best = csmScores[id].name }
  }
  return best || '—'
})
</script>
