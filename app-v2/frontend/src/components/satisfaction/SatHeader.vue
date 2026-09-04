<template>
  <div class="satisfaction_header">
    <div>
      <h1>⭐ {{ t('sat_title') }}</h1>
    </div>
    <div class="satisfaction_header_right">
      <button v-if="canCustomize" class="button_customize" @click="$emit('customize')">⚙ {{ t('kpi_cust_title') }}</button>
      <button class="button_outline" @click="$emit('reset')">{{ t('sat_reset') }}</button>
      <div class="satisfaction_score_badge">
        <span class="ssb_label">{{ t('sat_avg_score') }}</span>
        <!-- HEALTH-SCALE: "6,4/10" colored by the effective status of the average -->
        <span class="ssb_value" :class="healthTone(healthStatus(globalScore, null))">{{ fmtHealth(globalScore, { average: true }) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { healthStatus, healthTone } from '@/lib/health'
import { fmtHealth } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  globalScore: { type: Number, default: null },
  canCustomize: { type: Boolean, default: false }
})

defineEmits(['customize', 'reset'])
</script>
