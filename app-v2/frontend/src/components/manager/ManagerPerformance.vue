<template>
  <section class="mgr-section">
    <h2>📊 {{ t('mgr_performance') }}</h2>
    <div class="perf-table">
      <div class="perf-header">
        <span>CSM</span>
        <span>{{ t('mgr_clients_managed') }}</span>
        <span>{{ t('mgr_arr_managed') }}</span>
        <span>{{ t('kpi_health') }}</span>
      </div>
      <div v-for="m in members" :key="m.id" class="perf-row">
        <div class="perf-name">
          <div class="perf-avatar" :class="m.statusLabel === 'overloaded' ? 'overloaded' : m.statusLabel ? 'healthy' : ''">{{ m.name[0] }}</div>
          <div>
            <strong>{{ m.name }}</strong>
            <span class="perf-role">{{ m.role }}</span>
          </div>
        </div>
        <!-- TEAM-METRICS (29/08) : comptes et ARR DÉRIVÉS du store clients par csm_id
             (m.clientCount/m.arrManaged du team store sont null par design B-09) -->
        <span class="perf-val">{{ clientCountFor(m.id) }}</span>
        <span class="perf-val">{{ fmtCurrency(arrManagedFor(m.id), { compact: true }) }}</span>
        <span class="perf-val">
          <span class="health-pill" :class="avgHealthClass(m.id)">
            {{ avgHealthForCsm(m.id) }}
          </span>
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useClientStore } from '@/stores/clients'
import { fmtCurrency, fmtHealth } from '@/lib/formatters'
import { healthStatus, healthTone, toHealthNumber } from '@/lib/health'

const { t } = useI18n({ useScope: 'global' })
const clients = useClientStore()

defineProps({
  members: { type: Array, required: true }
})

// HEALTH-SCALE (25/08) : moyenne /10 des clients ACTIFS assignés (prospects exclus, comme
// clients.avgHealth) ; null si aucun → « — ». Seuils de couleur = statut effectif (3/6),
// plus de 5/7 locaux.
function avgHealthValue(csmId) {
  const csmClients = clients.clientsOnly.filter(c => c.csmId === csmId)
  if (!csmClients.length) return null
  return csmClients.reduce((s, c) => s + (toHealthNumber(c.health) ?? 0), 0) / csmClients.length
}

function avgHealthForCsm(csmId) {
  return fmtHealth(avgHealthValue(csmId), { average: true })
}

function avgHealthClass(csmId) {
  const v = avgHealthValue(csmId)
  return v === null ? '' : healthTone(healthStatus(v, null))
}

// TEAM-METRICS (29/08) : dérivés réels depuis les clients ACTIFS assignés (csm_id) —
// même périmètre que avgHealthValue. 0 = zéro client assigné, une donnée vraie (R21).
function clientCountFor(csmId) {
  return clients.clientsOnly.filter(c => c.csmId === csmId).length
}
function arrManagedFor(csmId) {
  return clients.clientsOnly.filter(c => c.csmId === csmId).reduce((s, c) => s + (c.arr || 0), 0)
}
</script>
