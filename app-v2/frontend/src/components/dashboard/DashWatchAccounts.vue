<template>
  <div class="dash-card">
    <div class="card-header">
      <h2>{{ t('dash_watch_accounts') }}</h2>
      <router-link to="/app/satisfaction" class="card-link">{{ t('dash_view_all') }} →</router-link>
    </div>

    <div class="satisfaction-chart">
      <div class="sat-donut">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#f3f4f6" stroke-width="10" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#10b981" stroke-width="10"
            :stroke-dasharray="healthyArc + ' ' + circumference"
            stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 60 60)" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#f59e0b" stroke-width="10"
            :stroke-dasharray="watchArc + ' ' + circumference"
            :stroke-dashoffset="'-' + healthyArc"
            stroke-linecap="round" transform="rotate(-90 60 60)" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#ef4444" stroke-width="10"
            :stroke-dasharray="criticalArc + ' ' + circumference"
            :stroke-dashoffset="'-' + (parseFloat(healthyArc) + parseFloat(watchArc))"
            stroke-linecap="round" transform="rotate(-90 60 60)" />
          <text x="60" y="58" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor">{{ totalClients }}</text>
          <text x="60" y="74" text-anchor="middle" font-size="9" fill="var(--text-muted)">{{ t('dash_clients') }}</text>
        </svg>
      </div>
      <div class="sat-legend">
        <div class="legend-item"><span class="dot green" /> {{ t('dash_healthy') }} <strong>{{ healthyCount }}</strong></div>
        <div class="legend-item"><span class="dot amber" /> {{ t('dash_watch') }} <strong>{{ watchCount }}</strong></div>
        <div class="legend-item"><span class="dot red" /> {{ t('dash_critical') }} <strong>{{ criticalCount }}</strong></div>
      </div>
    </div>

    <div class="top-accounts">
      <div
        v-for="c in watchAccounts"
        :key="c.id"
        class="account-row"
        @click="clientModal.open(c.id)"
      >
        <div class="acc-avatar" :style="{ background: c.color || '#6366f1' }">
          {{ (c.name || '?')[0] }}
        </div>
        <div class="acc-info">
          <strong>{{ c.name }}</strong>
          <span class="acc-industry">{{ c.industry }}</span>
        </div>
        <div class="acc-health">
          <!-- HEALTH-SCALE : valeur /10 localisée + couleur du statut EFFECTIF (lib/health), plus jamais c.status brut -->
          <span class="health-score" :style="{ color: colorOf(c) }">{{ fmtHealth(c.health) }}</span>
          <div class="health-bar-bg">
            <div class="health-bar-fill" :style="{ width: healthPct(c.health) + '%', background: colorOf(c) }" />
          </div>
        </div>
      </div>
      <div v-if="!watchAccounts.length" class="empty-state">{{ t('no_data') }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useClientModalStore } from '@/stores/clientModal'
import { healthStatus, healthColor, healthPct } from '@/lib/health'
import { fmtHealth } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })
const clientModal = useClientModalStore()

defineProps({
  watchAccounts: { type: Array, default: () => [] },
  healthyArc:    { type: [String, Number], default: 0 },
  watchArc:      { type: [String, Number], default: 0 },
  criticalArc:   { type: [String, Number], default: 0 },
  circumference: { type: [String, Number], default: 0 },
  totalClients:  { type: Number, default: 0 },
  healthyCount:  { type: Number, default: 0 },
  watchCount:    { type: Number, default: 0 },
  criticalCount: { type: Number, default: 0 }
})

function colorOf(c) {
  return healthColor(healthStatus(c.health, c.status))
}
</script>

<style scoped>
.dash-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h2 { font-size: 0.9rem; font-weight: 700; color: var(--text); }
.card-link { font-size: 0.78rem; color: var(--primary); text-decoration: none; font-weight: 500; }
.satisfaction-chart { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
.sat-donut { width: 120px; height: 120px; flex-shrink: 0; }
.sat-legend { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--text-secondary); }
.legend-item { display: flex; align-items: center; gap: 8px; }
.legend-item strong { color: var(--text); margin-left: auto; min-width: 20px; text-align: right; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.green { background: var(--green); }
.dot.amber { background: var(--amber); }
.dot.red { background: var(--red); }
.top-accounts { display: flex; flex-direction: column; gap: 6px; }
.account-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--radius-sm); transition: background 0.15s; cursor: pointer; }
.account-row:hover { background: var(--bg-hover); }
.acc-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
.acc-info { flex: 1; min-width: 0; }
.acc-info strong { font-size: 0.82rem; display: block; }
.acc-industry { font-size: 0.7rem; color: var(--text-muted); }
.acc-health { text-align: right; min-width: 60px; }
.health-score { font-size: 0.82rem; font-weight: 700; }
.health-bar-bg { width: 50px; height: 4px; background: var(--border); border-radius: 2px; margin-top: 4px; }
.health-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
.empty-state { font-size: 0.82rem; color: var(--text-muted); padding: 16px; text-align: center; }
</style>