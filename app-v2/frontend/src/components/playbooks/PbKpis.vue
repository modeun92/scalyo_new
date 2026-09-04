<template>
  <div class="playbook_kpis">
    <div class="kpi_page">
      <span class="kpi_page_icon">▶️</span>
      <div>
        <span class="kpi_page_value">{{ activeCount }}</span>
        <span class="playbooks_kpi_page_label">{{ t('pb_kpi_active') }}</span>
      </div>
    </div>
    <div class="kpi_page">
      <span class="kpi_page_icon">✅</span>
      <div>
        <span class="kpi_page_value">{{ doneMonth }}</span>
        <span class="playbooks_kpi_page_label">{{ t('pb_kpi_done_month') }}</span>
      </div>
    </div>
    <div class="kpi_page">
      <span class="kpi_page_icon">⏱️</span>
      <div>
        <span class="kpi_page_value">
          {{ avgDuration || '—' }}
          <small v-if="avgDuration">{{ t('pb_days') }}</small>
        </span>
        <span class="playbooks_kpi_page_label">{{ t('pb_kpi_avg_duration') }}</span>
      </div>
    </div>
    <div class="kpi_page">
      <span class="kpi_page_icon">🎯</span>
      <div>
        <span class="kpi_page_value">{{ successRate }}%</span>
        <span class="playbooks_kpi_page_label">{{ t('pb_kpi_success') }}</span>
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
