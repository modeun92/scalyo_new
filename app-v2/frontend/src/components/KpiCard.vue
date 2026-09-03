<template>
  <div class="kpi-card" :class="[size, statusClass]">
    <div class="kc-header">
      <span class="kc-label">{{ localLabel }}</span>
      <span v-if="change" class="kc-change" :class="changePositive ? 'up' : 'down'">{{ change > 0 ? '+' : '' }}{{ change }}{{ isPercent ? 'pts' : meta?.unit || '' }}</span>
    </div>
    <div class="kc-value">{{ formattedValue }}</div>
    <div v-if="target" class="kc-target">{{ t('copil_wiz_target') }}: {{ formattedTarget }}</div>
    <div v-if="target" class="kc-bar"><div class="kc-fill" :style="{ width: Math.min(pct, 100) + '%' }" /></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { KPI_CATALOG } from '@/data/kpiCatalog'

const props = defineProps({
  kpiId: { type: String, required: true },
  value: { type: Number, default: 0 },
  target: { type: Number, default: null },
  previous: { type: Number, default: null },
  size: { type: String, default: 'md' }, // sm, md, lg
})

const { t, locale } = useI18n({ useScope: 'global' })
import { fmtCurrency } from '@/lib/formatters'

const meta = computed(() => KPI_CATALOG.find(k => k.id === props.kpiId))

const localLabel = computed(() => {
  if (!meta.value) return props.kpiId
  if (locale.value === 'en') return meta.value.labelEN || meta.value.label
  if (locale.value === 'ko') return meta.value.labelKO || meta.value.label
  return meta.value.label
})

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
  if (f === 'score') return v + (meta.value?.unit || '')
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
.kpi-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; transition: all 0.2s; }
.kpi-card:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.kpi-card.st-excellent { border-left: 3px solid var(--green); }
.kpi-card.st-good { border-left: 3px solid var(--blue); }
.kpi-card.st-alert { border-left: 3px solid var(--red); }
.kpi-card.lg { padding: 22px; }
.kpi-card.sm { padding: 12px; }

.kc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kc-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.kc-change { font-size: 0.68rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
.kc-change.up { background: var(--green-bg); color: var(--green); }
.kc-change.down { background: var(--red-bg); color: var(--red); }

.kc-value { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.kpi-card.lg .kc-value { font-size: 2rem; }
.kpi-card.sm .kc-value { font-size: 1.1rem; }

.kc-target { font-size: 0.68rem; color: var(--text-muted); margin-bottom: 6px; }
.kc-bar { height: 4px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.kc-fill { height: 100%; background: var(--purple); border-radius: 2px; transition: width 0.6s ease; }
.st-excellent .kc-fill { background: var(--green); }
.st-alert .kc-fill { background: var(--red); }
</style>
