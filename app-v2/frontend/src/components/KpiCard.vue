<template>
  <div class="kpi_card" :class="[size, statusClass]">
    <div class="kpi_customizer_header">
      <span class="kpi_customizer_label">{{ localLabel }}</span>
      <span v-if="change" class="kpi_customizer_change" :class="changePositive ? 'up' : 'down'">{{ change > 0 ? '+' : '' }}{{ change }}{{ isPercent ? 'pts' : kpiUnit(meta) }}</span>
    </div>
    <div class="kpi_customizer_value">{{ formattedValue }}</div>
    <div v-if="target" class="kpi_customizer_target">{{ t('copil_wiz_target') }}: {{ formattedTarget }}</div>
    <div v-if="target" class="kpi_customizer_bar"><div class="kpi_customizer_fill" :style="{ width: Math.min(pct, 100) + '%' }" /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { KPI_CATALOG } from '@/config/kpis'

const props = defineProps({
  kpiId: { type: String, required: true },
  value: { type: Number, default: 0 },
  target: { type: Number, default: null },
  previous: { type: Number, default: null },
  size: { type: String, default: 'md' }, // sm, md, lg
})

const { t, locale } = useI18n({ useScope: 'global' })
// CURRENCY-ACCOUNT (04/09): kpiUnit() — a 'currency' KPI shows the ACCOUNT symbol, no more catalog '€'.
import { fmtCurrency, kpiUnit } from '@/lib/formatters'

const meta = computed(() => KPI_CATALOG.find(k => k.id === props.kpiId))

// KPI-I18N (04/09): the catalog carries an i18n KEY, t() resolves it — no more
// per-component locale ladder over labelEN / labelKO. Unknown id → the id itself.
const localLabel = computed(() => meta.value ? t(meta.value.label) : props.kpiId)

const isPercent = computed(() => meta.value?.format === 'percentage')

const formattedValue = computed(() => formatVal(props.value))
const formattedTarget = computed(() => formatVal(props.target))

function formatVal(v) {
  if (v == null) return '—'
  const loc = locale.value === 'ko' ? 'ko-KR' : locale.value === 'en' ? 'en-US' : 'fr-FR'
  const f = meta.value?.format
  // A-11: ACCOUNT currency (central formatter), never again a forced EUR
  if (f === 'currency') return fmtCurrency(v, { compact: v >= 1e6 })
  if (f === 'percentage') return v + '%'
  if (f === 'ratio') return v + 'x'
  if (f === 'days') return v + 'j'
  if (f === 'hours') return v + 'h'
  if (f === 'score') return v + kpiUnit(meta.value)
  return new Intl.NumberFormat(loc).format(v)
}

const change = computed(() => {
  if (props.previous == null || props.value == null) return null
  return +(props.value - props.previous).toFixed(1)
})

const changePositive = computed(() => {
  if (change.value == null) return true
  return meta.value?.inverse ? change.value <= 0 : change.value >= 0
})

const pct = computed(() => {
  if (!props.target) return 0
  return Math.round((meta.value?.inverse ? props.target / props.value : props.value / props.target) * 100)
})

const statusClass = computed(() => {
  const b = meta.value?.benchmark
  if (!b || props.value == null) return ''
  if (meta.value?.inverse) {
    if (props.value <= (b.excellent || 0)) return 'st-excellent'
    if (props.value <= (b.good || 0)) return 'st-good'
    return 'st-alert'
  }
  if (b.world_class && props.value >= b.world_class) return 'st-excellent'
  if (b.excellent && props.value >= b.excellent) return 'st-excellent'
  if (b.good && props.value >= b.good) return 'st-good'
  return 'st-alert'
})
</script>

<style scoped>
.kpi_card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; transition: all 0.2s; }
.kpi_card:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.kpi_card.status_excellent { border-left: 3px solid var(--green); }
.kpi_card.status_good { border-left: 3px solid var(--blue); }
.kpi_card.status_alert { border-left: 3px solid var(--red); }
.kpi_card.large { padding: 22px; }
.kpi_card.small { padding: 12px; }

.kpi_customizer_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kpi_customizer_label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.kpi_customizer_change { font-size: 0.68rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
.kpi_customizer_change.up { background: var(--green-bg); color: var(--green); }
.kpi_customizer_change.down { background: var(--red-bg); color: var(--red); }

.kpi_customizer_value { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.kpi_card.large .kpi_customizer_value { font-size: 2rem; }
.kpi_card.small .kpi_customizer_value { font-size: 1.1rem; }

.kpi_customizer_target { font-size: 0.68rem; color: var(--text-muted); margin-bottom: 6px; }
.kpi_customizer_bar { height: 4px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.kpi_customizer_fill { height: 100%; background: var(--purple); border-radius: 2px; transition: width 0.6s ease; }
.status_excellent .kpi_customizer_fill { background: var(--green); }
.status_alert .kpi_customizer_fill { background: var(--red); }
</style>
