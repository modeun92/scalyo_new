<template>
  <div class="arr-row">
    <div class="arr-card">
      <span class="arr-label">{{ t('sat_arr_total') }}</span>
      <span class="arr-value">{{ fmtCurrency(totalArr) }}</span>
    </div>
    <div class="arr-card risk">
      <span class="arr-label">{{ t('sat_arr_at_risk') }}</span>
      <span class="arr-value red">{{ fmtCurrency(arrAtRisk) }}</span>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { fmtCurrency } from './satisfactionHelpers'

const { t, locale } = useI18n({ useScope: 'global' })

defineProps({
  totalArr: { type: Number, default: 0 },
  arrAtRisk: { type: Number, default: 0 }
})
</script>
