<template>
  <div class="dashboard_card">
    <div class="card_header">
      <h2>{{ t('dash_watch_accounts') }}</h2>
      <router-link to="/app/satisfaction" class="card_link">{{ t('dash_view_all') }} →</router-link>
    </div>

    <div class="satisfaction_chart">
      <div class="satisfaction_donut">
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
      <div class="satisfaction_legend">
        <div class="legend_item"><span class="status_dot green" /> {{ t('dash_healthy') }} <strong>{{ healthyCount }}</strong></div>
        <div class="legend_item"><span class="status_dot amber" /> {{ t('dash_watch') }} <strong>{{ watchCount }}</strong></div>
        <div class="legend_item"><span class="status_dot red" /> {{ t('dash_critical') }} <strong>{{ criticalCount }}</strong></div>
      </div>
    </div>

    <div class="top_accounts">
      <div
        v-for="c in watchAccounts"
        :key="c.id"
        class="account_row"
        @click="clientModal.open(c.id)"
      >
        <div class="account_avatar" :style="{ background: c.color || '#6366f1' }">
          {{ (c.name || '?')[0] }}
        </div>
        <div class="account_info">
          <strong>{{ c.name }}</strong>
          <span class="account_industry">{{ c.industry }}</span>
        </div>
        <div class="account_health">
          <!-- HEALTH-SCALE: localized value out of 10 + color of the EFFECTIVE status (lib/health), never again a raw c.status -->
          <span class="health_score" :style="{ color: colorOf(c) }">{{ fmtHealth(c.health) }}</span>
          <div class="health_bar_background">
            <div class="health_bar_fill" :style="{ width: healthPct(c.health) + '%', background: colorOf(c) }" />
          </div>
        </div>
      </div>
      <div v-if="!watchAccounts.length" class="empty_state">{{ t('no_data') }}</div>
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
.dashboard_card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card_header h2 { font-size: 0.9rem; font-weight: 700; color: var(--text); }
.card_link { font-size: 0.78rem; color: var(--primary); text-decoration: none; font-weight: 500; }
.satisfaction_chart { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
.satisfaction_donut { width: 120px; height: 120px; flex-shrink: 0; }
.satisfaction_legend { display: flex; flex-direction: column; gap: 6px; font-size: 0.82rem; color: var(--text-secondary); }
.legend_item { display: flex; align-items: center; gap: 8px; }
.legend_item strong { color: var(--text); margin-left: auto; min-width: 20px; text-align: right; }
.status_dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status_dot.green { background: var(--green); }
.status_dot.amber { background: var(--amber); }
.status_dot.red { background: var(--red); }
.top_accounts { display: flex; flex-direction: column; gap: 6px; }
.account_row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--radius-sm); transition: background 0.15s; cursor: pointer; }
.account_row:hover { background: var(--bg-hover); }
.account_avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
.account_info { flex: 1; min-width: 0; }
.account_info strong { font-size: 0.82rem; display: block; }
.account_industry { font-size: 0.7rem; color: var(--text-muted); }
.account_health { text-align: right; min-width: 60px; }
.health_score { font-size: 0.82rem; font-weight: 700; }
.health_bar_background { width: 50px; height: 4px; background: var(--border); border-radius: 2px; margin-top: 4px; }
.health_bar_fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
.empty_state { font-size: 0.82rem; color: var(--text-muted); padding: 16px; text-align: center; }
</style>