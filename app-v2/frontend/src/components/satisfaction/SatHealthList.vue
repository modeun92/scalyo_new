<template>
  <div class="sat-card">
    <h3>{{ t('sat_portfolio_health') }}</h3>
    <div class="health-list">
      <!-- HEALTH-SCALE : score /10 localisé (plus de ×10 « 10 /100 »), avatar/teinte/badge par le
           statut EFFECTIF — la même fonction que le Dashboard et le Portefeuille -->
      <div v-for="c in sortedClients" :key="c.id" class="hl-row hl-clickable" @click="clientModal.open(c.id)">
        <div class="hl-left">
          <div class="hl-av" :class="statusOf(c)">{{ c.name[0] }}</div>
          <div class="hl-info">
            <strong>{{ c.name }}</strong>
            <span>{{ c.csm }} · {{ fmtCurrency(c.arr) }}</span>
          </div>
        </div>
        <div class="hl-right">
          <div class="hl-score-wrap">
            <span class="hl-score" :class="healthTone(statusOf(c))">
              {{ fmtHealth(c.health) }}
            </span>
            <div class="hl-bar-bg">
              <div
                class="hl-bar"
                :class="healthTone(statusOf(c))"
                :style="{ width: healthPct(c.health) + '%' }"
              />
            </div>
          </div>
          <span class="hl-status" :class="statusOf(c)">{{ t('status_' + statusOf(c)) }}</span>
        </div>
      </div>
      <div v-if="!sortedClients.length" class="sat-empty">{{ t('sat_no_clients') }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { fmtCurrency } from './satisfactionHelpers'
import { healthStatus, healthTone, healthPct } from '@/lib/health'
import { fmtHealth } from '@/lib/formatters'
import { useClientModalStore } from '@/stores/clientModal'

const { t } = useI18n({ useScope: 'global' })
const clientModal = useClientModalStore()

function statusOf(c) { return healthStatus(c.health, c.status) }

defineProps({
  sortedClients: { type: Array, default: () => [] }
})
</script>

<style scoped>
.hl-clickable { cursor: pointer; transition: background .15s; border-radius: 8px; }
.hl-clickable:hover { background: var(--bg-hover); }
/* NAV-SLOW (29/08) : virtualisation navigateur — les lignes hors écran ne sont ni mises en
   page ni peintes (1 097 clients constatés en préprod). Zéro dépendance, scroll natif ;
   contain-intrinsic-size ≈ hauteur d'une ligne pour une barre de défilement stable. */
.hl-row { content-visibility: auto; contain-intrinsic-size: auto 56px; }
</style>
