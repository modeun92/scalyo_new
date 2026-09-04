<template>
  <div class="arr_row">
    <div class="arr_card">
      <span class="arr_label">{{ t('sat_arr_total') }}</span>
      <span class="arr_value">{{ fmtCurrency(totalArr) }}</span>
    </div>
    <div class="arr_card risk">
      <span class="arr_label">{{ t('sat_arr_at_risk') }}</span>
      <span class="arr_value red">{{ fmtCurrency(arrAtRisk) }}</span>
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
