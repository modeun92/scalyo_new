<template>
  <section class="manager_section">
    <!-- Alerts -->
    <h2>🔔 {{ t('mgr_alerts') }}</h2>
    <div class="alerts_list">
      <div
        v-for="n in activeAlerts"
        :key="n.id"
        class="alert_item"
        :class="[n.type, { 'alert_clickable': n.target_id }]"
        @click="n.target_id && clientModal.open(n.target_id)"
      >
        <span class="alert_icon">{{ n.icon }}</span>
        <div class="alert_content">
          <strong>{{ notifTitle(n, t) }}</strong>
          <p>{{ notifBody(n, t) }}</p>
        </div>
      </div>
      <div v-if="!activeAlerts.length" class="empty_alerts">
        {{ t('mgr_no_alerts') }}
      </div>
    </div>

    <!-- Portfolio Overview -->
    <h2 class="mt_section">💼 {{ t('mgr_portfolio_overview') }}</h2>
    <div class="portfolio_mini">
      <div class="performance_manager_stat">
        <div class="performance_manager_donut_mini">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f3f4f6" stroke-width="7" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="#10b981" stroke-width="7"
              :stroke-dasharray="healthyArc + ' ' + circum"
              stroke-dashoffset="0" stroke-linecap="round"
              transform="rotate(-90 40 40)"
            />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="#f59e0b" stroke-width="7"
              :stroke-dasharray="watchArc + ' ' + circum"
              :stroke-dashoffset="'-' + healthyArc"
              stroke-linecap="round" transform="rotate(-90 40 40)"
            />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="#ef4444" stroke-width="7"
              :stroke-dasharray="criticalArc + ' ' + circum"
              :stroke-dashoffset="'-' + (parseFloat(healthyArc) + parseFloat(watchArc))"
              stroke-linecap="round" transform="rotate(-90 40 40)"
            />
          </svg>
        </div>
        <div class="performance_manager_legend">
          <div><span class="status_dot green" /> {{ t('status_healthy') }}: <strong>{{ clients.healthyCount }}</strong></div>
          <div><span class="status_dot amber" /> {{ t('status_watch') }}: <strong>{{ clients.watchCount }}</strong></div>
          <div><span class="status_dot red" /> {{ t('status_critical') }}: <strong>{{ clients.criticalCount }}</strong></div>
        </div>
      </div>

      <div class="performance_manager_kpi_row">
        <div class="performance_manager_kpi">
          <span class="performance_manager_kpi_value">{{ fmtCurrency(clients.totalArr, { compact: true }) }}</span>
          <span>{{ t('kpi_arr') }}</span>
        </div>
        <div class="performance_manager_kpi">
          <span class="performance_manager_kpi_value red">{{ fmtCurrency(clients.arrAtRisk, { compact: true }) }}</span>
          <span>{{ t('kpi_arr_at_risk') }}</span>
        </div>
        <div class="performance_manager_kpi">
          <span class="performance_manager_kpi_value">{{ clients.renewalsNext30 }}</span>
          <span>{{ t('kpi_renewals_30d') }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClientStore } from '@/stores/clients'
import { useClientModalStore } from '@/stores/clientModal'
import { useNotificationStore } from '@/stores/notifications'
import { notifTitle, notifBody } from '@/lib/notifText'
import { fmtCurrency } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })
const clients = useClientStore()
const clientModal = useClientModalStore()
const notifications = useNotificationStore()

const activeAlerts = computed(() =>
  notifications.notifications.filter(n => !n.read).slice(0, 5)
)

const circum = (2 * Math.PI * 34).toFixed(1)
const total = computed(() => clients.clients.length || 1)

const healthyArc = computed(() =>
  ((clients.healthyCount / total.value) * parseFloat(circum)).toFixed(1)
)
const watchArc = computed(() =>
  ((clients.watchCount / total.value) * parseFloat(circum)).toFixed(1)
)
const criticalArc = computed(() =>
  ((clients.criticalCount / total.value) * parseFloat(circum)).toFixed(1)
)
</script>
