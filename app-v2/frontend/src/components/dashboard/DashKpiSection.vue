<template>
  <div class="kpi-section">
    <div class="kpi-header-row">
      <h2 class="kpi-section-title">KPIs</h2>
      <div class="kpi-header-actions">
        <div class="period-selector">
          <span class="period-label">{{ t('dash_compare_with') }}</span>
          <div class="period-pills">
            <button
              v-for="p in periods"
              :key="p.key"
              class="period-pill"
              :class="{ active: comparePeriod === p.key }"
              @click="$emit('period-change', p.key)"
            >
              {{ t(p.label) }}
            </button>
          </div>
        </div>
        <button v-if="canCustomize" class="btn-customize" @click="$emit('customize')">⚙️ {{ t('dash_customize_kpis') }}</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div
        v-for="kpi in visibleKpis"
        :key="kpi.id"
        class="kpi-card"
        :class="{ warn: kpi.warn }"
      >
        <span class="kpi-icon">{{ kpi.icon }}</span>
        <div class="kpi-value">{{ kpi.display }}</div>
        <div class="kpi-label">{{ kpi.label }}</div>
        <div v-if="kpi.change !== null" class="kpi-change" :class="kpi.changeClass">
          {{ kpi.changeLabel }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  visibleKpis:   { type: Array, required: true },
  periods:       { type: Array, required: true },
  comparePeriod: { type: String, default: '7d' },
  canCustomize:  { type: Boolean, default: false }
})

defineEmits(['customize', 'period-change'])
</script>

<style scoped>
.kpi-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.kpi-section-title { font-size: 0.9rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); }
.kpi-header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.period-selector { display: flex; align-items: center; gap: 6px; }
.period-label { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
.period-pills { display: flex; gap: 4px; }
.period-pill { font-size: 0.72rem; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.period-pill.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn-customize { font-size: 0.78rem; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.btn-customize:hover { background: var(--bg-hover); }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
.kpi-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; transition: box-shadow 0.2s; }
.kpi-card:hover { box-shadow: var(--shadow-sm); }
.kpi-card.warn { border-left: 3px solid var(--red); }
.kpi-icon { font-size: 1.5rem; margin-bottom: 4px; }
.kpi-value { font-size: 1.4rem; font-weight: 800; color: var(--text); }
.kpi-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
.kpi-change { font-size: 0.68rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-top: 4px; }
.kpi-change.up { color: var(--green); background: var(--green-bg); }
.kpi-change.down { color: var(--red); background: var(--red-bg); }
.kpi-change.down-good { color: var(--green); background: var(--green-bg); }
.kpi-change.neutral { color: var(--text-muted); background: var(--bg-hover); }
</style>