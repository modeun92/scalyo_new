<template>
  <div class="satisfaction_card gauge_card">
    <!-- Gauge -->
    <div class="gauge_wrapper">
      <svg viewBox="0 0 200 200" class="gauge_svg">
        <circle cx="100" cy="100" r="85" fill="none" stroke="#f3f4f6" stroke-width="14" />
        <!-- HEALTH-SCALE: score out of 10 (gauge = percentage of the scale); color = theme variable
             via style (var() is not guaranteed inside an SVG stroke=/fill= attribute) -->
        <circle
          cx="100" cy="100" r="85" fill="none"
          :style="{ stroke: gaugeColor }" stroke-width="14"
          :stroke-dasharray="gaugeArc + ' 534.07'"
          stroke-dashoffset="0" stroke-linecap="round"
          transform="rotate(-90 100 100)" class="gauge_progress"
        />
        <text x="100" y="92" text-anchor="middle" font-size="42" font-weight="800" :style="{ fill: gaugeColor }">
          {{ fmtHealth(globalScore, { suffix: false, average: true }) }}
        </text>
        <text x="100" y="116" text-anchor="middle" font-size="14" fill="#9ca3af">
          {{ t('sat_score_out_of') }}
        </text>
      </svg>
    </div>

    <!-- Distribution -->
    <div class="distrib">
      <h3>{{ t('sat_distribution') }}</h3>
      <div class="distrib_bars">
        <div class="dbar">
          <div class="dbar_header">
            <span class="status_dot green" /> {{ t('sat_healthy') }}<strong>{{ healthyCount }}</strong>
          </div>
          <div class="dbar_track">
            <div class="dbar_fill green" :style="{ width: pct(healthyCount, totalClients) + '%' }" />
          </div>
        </div>
        <div class="dbar">
          <div class="dbar_header">
            <span class="status_dot amber" /> {{ t('sat_watch') }}<strong>{{ watchCount }}</strong>
          </div>
          <div class="dbar_track">
            <div class="dbar_fill amber" :style="{ width: pct(watchCount, totalClients) + '%' }" />
          </div>
        </div>
        <div class="dbar">
          <div class="dbar_header">
            <span class="status_dot red" /> {{ t('sat_risk') }}<strong>{{ criticalCount }}</strong>
          </div>
          <div class="dbar_track">
            <div class="dbar_fill red" :style="{ width: pct(criticalCount, totalClients) + '%' }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { pct } from './satisfactionHelpers'
import { fmtHealth } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  globalScore: { type: Number, default: null },
  gaugeColor: { type: String, default: 'var(--green)' },
  gaugeArc: { type: String, default: '0' },
  healthyCount: { type: Number, default: 0 },
  watchCount: { type: Number, default: 0 },
  criticalCount: { type: Number, default: 0 },
  totalClients: { type: Number, default: 0 }
})
</script>
