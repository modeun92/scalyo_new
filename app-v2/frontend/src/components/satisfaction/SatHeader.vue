<template>
  <div class="sat-header">
    <div>
      <h1>⭐ {{ t('sat_title') }}</h1>
    </div>
    <div class="sat-header-right">
      <button v-if="canCustomize" class="btn-customize" @click="$emit('customize')">⚙ {{ t('kpi_cust_title') }}</button>
      <button class="btn-outline" @click="$emit('reset')">{{ t('sat_reset') }}</button>
      <div class="sat-score-badge">
        <span class="ssb-label">{{ t('sat_avg_score') }}</span>
        <!-- HEALTH-SCALE : « 6,4/10 » coloré par le statut effectif de la moyenne -->
        <span class="ssb-value" :class="healthTone(healthStatus(globalScore, null))">{{ fmtHealth(globalScore, { average: true }) }}</span>
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
