<template>
  <div class="sat-card indicators">
    <h3>{{ t('sat_key_indicators') }}</h3>
    <div class="ind-grid">
      <div class="ind">
        <span class="ind-icon">📅</span>
        <div>
          <span class="ind-val">{{ renewalsNext30 }}</span>
          <span class="ind-label">{{ t('sat_renewals_30d') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="ind-icon">📉</span>
        <div>
          <span class="ind-val red">{{ decliningCount }}</span>
          <span class="ind-label">{{ t('sat_declining') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="ind-icon">🏆</span>
        <div>
          <span class="ind-val green">{{ bestCsm }}</span>
          <span class="ind-label">{{ t('sat_best_csm') }}</span>
        </div>
      </div>
      <div class="ind">
        <span class="ind-icon">⚠️</span>
        <div>
          <span class="ind-val red">{{ fmtCurrency(arrAtRisk, { compact: true }) }}</span>
          <span class="ind-label">{{ t('sat_arr_at_risk') }}</span>
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
  bestCsm: { type: String, default: '\u2014' },
  arrAtRisk: { type: Number, default: 0 }
})
</script>
