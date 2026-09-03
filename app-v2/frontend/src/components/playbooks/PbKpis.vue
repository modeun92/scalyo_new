<template>
  <div class="pb-kpis">
    <div class="pkpi">
      <span class="pkpi-icon">▶️</span>
      <div>
        <span class="pkpi-val">{{ activeCount }}</span>
        <span class="pkpi-lbl">{{ t('pb_kpi_active') }}</span>
      </div>
    </div>
    <div class="pkpi">
      <span class="pkpi-icon">✅</span>
      <div>
        <span class="pkpi-val">{{ doneMonth }}</span>
        <span class="pkpi-lbl">{{ t('pb_kpi_done_month') }}</span>
      </div>
    </div>
    <div class="pkpi">
      <span class="pkpi-icon">⏱️</span>
      <div>
        <span class="pkpi-val">
          {{ avgDuration || '—' }}
          <small v-if="avgDuration">{{ t('pb_days') }}</small>
        </span>
        <span class="pkpi-lbl">{{ t('pb_kpi_avg_duration') }}</span>
      </div>
    </div>
    <div class="pkpi">
      <span class="pkpi-icon">🎯</span>
      <div>
        <span class="pkpi-val">{{ successRate }}%</span>
        <span class="pkpi-lbl">{{ t('pb_kpi_success') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  activeCount: { type: Number, default: 0 },
  doneMonth: { type: Number, default: 0 },
  avgDuration: { type: [Number, String, null], default: null },
  successRate: { type: Number, default: 0 }
})
</script>
