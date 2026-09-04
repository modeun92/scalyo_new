<template>
  <div class="kpi_section">
    <div class="kpi_header_row">
      <h2 class="kpi_section_title">KPIs</h2>
      <div class="kpi_header_actions">
        <div class="period_selector">
          <span class="period_label">{{ t('dash_compare_with') }}</span>
          <div class="period_pills">
            <button
              v-for="p in periods"
              :key="p.key"
              class="period_pill"
              :class="{ active: comparePeriod === p.key }"
              @click="$emit('period-change', p.key)"
            >
              {{ t(p.label) }}
            </button>
          </div>
        </div>
        <button v-if="canCustomize" class="button_customize" @click="$emit('customize')">⚙️ {{ t('dash_customize_kpis') }}</button>
      </div>
    </div>

    <div class="kpi_grid">
      <div
        v-for="kpi in visibleKpis"
        :key="kpi.id"
        class="kpi_card"
        :class="{ warn: kpi.warn }"
      >
        <span class="kpi_icon">{{ kpi.icon }}</span>
        <div class="kpi_value">{{ kpi.display }}</div>
        <div class="kpi_label">{{ kpi.label }}</div>
        <div v-if="kpi.change !== null" class="kpi_change" :class="kpi.changeClass">
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
.kpi_header_row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.kpi_section_title { font-size: 0.9rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); }
.kpi_header_actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.period_selector { display: flex; align-items: center; gap: 6px; }
.period_label { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }
.period_pills { display: flex; gap: 4px; }
.period_pill { font-size: 0.72rem; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.period_pill.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.button_customize { font-size: 0.78rem; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.button_customize:hover { background: var(--bg-hover); }
.kpi_grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
.kpi_card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; transition: box-shadow 0.2s; }
.kpi_card:hover { box-shadow: var(--shadow-sm); }
.kpi_card.warn { border-left: 3px solid var(--red); }
.kpi_icon { font-size: 1.5rem; margin-bottom: 4px; }
.kpi_value { font-size: 1.4rem; font-weight: 800; color: var(--text); }
.kpi_label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
.kpi_change { font-size: 0.68rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-top: 4px; }
.kpi_change.up { color: var(--green); background: var(--green-bg); }
.kpi_change.down { color: var(--red); background: var(--red-bg); }
.kpi_change.down_good { color: var(--green); background: var(--green-bg); }
.kpi_change.neutral { color: var(--text-muted); background: var(--bg-hover); }
</style>