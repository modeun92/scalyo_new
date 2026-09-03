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

    <div class="sat-grid">
      <div class="sat-left">
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

      <div class="sat-right">
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
const canCustomizeKpis = computed(() => hasFeature(auth.effectivePlan, 'dashboardKPIsAvances'))

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

// HEALTH-SCALE (25/08) : filtres, score global et déclin lisent le statut EFFECTIF et
// l'échelle /10 de lib/health — plus de `c.status` brut ni de ×10 (« 10 /100 »).
const statusOf = (c) => clients.getEffectiveStatus(c)

// COUNT-353-352 (29/08) : base = clientsOnly (prospects exclus), même périmètre que les
// compteurs du store (healthy/watch/critical, arrAtRisk) — un prospect n'a pas de santé mesurée.
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

// Score moyen /10 (1 décimale), même formule que clients.avgHealth mais sur la sélection filtrée
const globalScore = computed(() => {
  if (!filteredClients.value.length) return null
  return parseFloat((filteredClients.value.reduce((s, c) => s + (toHealthNumber(c.health) ?? 0), 0) / filteredClients.value.length).toFixed(1))
})

// Couleur et seuils = ceux du statut effectif (3/6), plus de 50/70 locaux
const gaugeStatus = computed(() => healthStatus(globalScore.value, null))
const gaugeColor = computed(() => healthColor(gaugeStatus.value))

const gaugeArc = computed(() => ((healthPct(globalScore.value) / 100) * 534.07).toFixed(1))

// « En déclin » = tout compte qui n'est pas Sain (statut effectif), plus de seuil local < 5
// COUNT-353-352 : sur clients actifs uniquement (même base que watchCount + criticalCount)
const decliningCount = computed(() => clients.clientsOnly.filter(c => statusOf(c) !== 'healthy').length)

const bestCsm = computed(() => {
  const csmScores = {}
  // BEST-CSM-VIDE (29/08) : les comptes SANS csm_id ne concourent pas — le groupe « vide »
  // (4 comptes, moyenne 7,0) battait Claire (95 comptes, 6,76) et affichait « — »
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
  return best || '\u2014'
})
</script>
