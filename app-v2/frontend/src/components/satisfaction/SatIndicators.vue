<template>
  <div class="satisfaction_card indicators">
    <h3>{{ t('sat_key_indicators') }}</h3>
    <div class="indicator_grid">
      <div class="ind">
        <span class="indicator_icon">📅</span>
        <div>
          <span class="indicator_value">{{ renewalsNext30 }}</span>
          <span class="indicator_label">{{ t('sat_renewals_30d') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="indicator_icon">📉</span>
        <div>
          <span class="indicator_value red">{{ decliningCount }}</span>
          <span class="indicator_label">{{ t('sat_declining') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="indicator_icon">🏆</span>
        <div>
          <span class="indicator_value green">{{ bestCsm }}</span>
          <span class="indicator_label">{{ t('sat_best_csm') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="indicator_icon">⚠️</span>
        <div>
          <span class="indicator_value red">{{ fmtCurrency(arrAtRisk, { compact: true }) }}</span>
          <span class="indicator_label">{{ t('sat_arr_at_risk') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { fmtCurrency } from './satisfactionHelpers'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  renewalsNext30: { type: Number, default: 0 },
  decliningCount: { type: Number, default: 0 },
  bestCsm: { type: String, default: '—' },
  arrAtRisk: { type: Number, default: 0 }
})
</script>
