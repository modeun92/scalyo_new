<template>
<div class="mw-overlay" @click.self="$emit('close')">
  <div class="mw">
    <div class="mw-head">
      <h3>✨ {{ t('copil_mw_title') }}</h3>
      <button class="mw-close" @click="$emit('close')">✕</button>
    </div>

    <!-- Business presets -->
    <div class="mw-presets">
      <button v-for="p in presets" :key="p.key" class="mw-preset" @click="applyPreset(p)">{{ p.icon }} {{ t('copil_ps_' + p.key) }}</button>
    </div>

    <!-- From the linked client's real measurements (client_metrics — contract 22/07) -->
    <div v-if="clientId && clientKpis.length" class="mw-client">
      <label class="mw-values-label">📊 {{ t('copil_mw_client_src') }}</label>
      <div class="mw-row">
        <select v-model="clientKpiId" class="fi grow">
          <option value="">{{ t('cmet_pick') }}</option>
          <option v-for="k in clientKpis" :key="k.id" :value="k.id">{{ kpiLabel(k) }}</option>
        </select>
        <button class="mw-use" :disabled="!clientKpiId" @click="useClientSeries">{{ t('copil_mw_client_use') }}</button>
      </div>
    </div>

    <div class="mw-row">
      <div class="fg grow"><label>{{ t('copil_mw_name') }}</label><input v-model="name" class="fi" :placeholder="t('copil_mw_name_ph')" /></div>
      <div class="fg sm"><label>{{ t('copil_mw_unit') }}</label><input v-model="unit" class="fi" placeholder="%" /></div>
      <div class="fg sm"><label>{{ t('copil_mw_target') }}</label><input v-model="target" type="number" step="any" class="fi" /></div>
    </div>

    <label class="mw-values-label">{{ t('copil_mw_values') }}</label>
    <div v-for="(r, i) in rows" :key="i" class="mw-vrow">
      <input v-model="r.label" class="fi" :placeholder="t('copil_mw_label')" />
      <input v-model="r.value" type="number" step="any" class="fi" :placeholder="t('copil_mw_value')" />
      <button v-if="rows.length > 1" class="mw-del" @click="rows.splice(i, 1)">✕</button>
    </div>
    <button class="mw-add-row" @click="rows.push({ label: '', value: '' })">+ {{ t('copil_mw_add_row') }}</button>

    <!-- Visual choice -->
    <label class="mw-values-label">{{ t('copil_mw_type') }}</label>
    <div class="mw-types">
      <button v-for="ty in types" :key="ty.key" class="mw-type" :class="{ active: hint === ty.key }" @click="hint = ty.key">
        {{ ty.icon }} {{ ty.key === 'auto' ? t('copil_mw_auto') : t(ty.labelKey) }}
      </button>
    </div>

    <div class="mw-foot">
      <span v-if="suggestion" class="mw-suggest">{{ t('copil_mw_suggest') }} : <strong>{{ t('copil_bt_' + suggestion.type) }}</strong></span>
      <button class="btn-primary" :disabled="!suggestion" @click="insert">{{ t('copil_mw_insert') }}</button>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { suggestBlock, buildMetricBlock } from '@/utils/smartVisual.js'
import { useClientMetricsStore } from '@/stores/clientMetrics'
import { KPI_CATALOG } from '@/data/kpiCatalog'
import { fmtMonth } from '@/lib/formatters'

const { t, locale } = useI18n({ useScope: 'global' })
const emit = defineEmits(['close', 'insert'])
const props = defineProps({ clientId: { type: String, default: null } })

// ── "Client data" source: monthly measurements entered on the record ──
const metricsStore = useClientMetricsStore()
if (props.clientId) metricsStore.loadAll()
const clientKpiId = ref('')
const clientKpis = computed(() => {
  if (!props.clientId) return []
  return KPI_CATALOG.filter(k => k.source === 'manual' && metricsStore.seriesFor(props.clientId, k.id).length)
})
function kpiLabel(k) {
  return locale.value === 'en' ? (k.labelEN || k.label) : locale.value === 'ko' ? (k.labelKO || k.label) : k.label
}
// Pre-fills the form with the real monthly series (last 12 months max).
// hint forced: ≥ 2 points → line chart, 1 point → KPI card (independent of the label
// language — isTemporalLabels does not recognize Korean months).
function useClientSeries() {
  const k = KPI_CATALOG.find(x => x.id === clientKpiId.value)
  if (!k || !props.clientId) return
  const pts = metricsStore.seriesFor(props.clientId, k.id).slice(-12)
  if (!pts.length) return
  name.value = kpiLabel(k)
  unit.value = k.unit || ''
  target.value = ''
  rows.value = pts.map(p => ({ label: fmtMonth(p.period), value: String(p.value) }))
  hint.value = pts.length > 1 ? 'line' : 'kpi'
}

const name = ref('')
const unit = ref('')
const target = ref('')
const hint = ref('auto')
const rows = ref([{ label: '', value: '' }])

const types = [
  { key: 'auto', icon: '✨' },
  { key: 'kpi', icon: '📈', labelKey: 'copil_bt_kpi_single' },
  { key: 'line', icon: '📉', labelKey: 'copil_bt_chart_line' },
  { key: 'bar', icon: '📊', labelKey: 'copil_bt_chart_bar' },
  { key: 'donut', icon: '🍩', labelKey: 'copil_bt_chart_donut' },
  { key: 'table', icon: '📋', labelKey: 'copil_bt_table' },
]

// Client-centric business presets: a starting point, everything stays editable.
const presets = [
  { key: 'adoption', icon: '🚀', unit: '%', target: 80, rows: [{ label: '', value: '' }] },
  { key: 'users', icon: '👥', unit: '', months: 4 },   // COPIL-I18N: months via Intl, no more hard-coded Jan/Feb
  { key: 'tickets', icon: '🎫', unit: '', target: null, rows: [{ label: '', value: '' }] },
  { key: 'response', icon: '⏱', unit: 'h', rows: [{ label: '', value: '' }] },
  { key: 'nps', icon: '⭐', unit: '', target: 50, rows: [{ label: '', value: '' }] },
  { key: 'roi', icon: '💰', unit: '%', rows: [{ label: '', value: '' }] },
  { key: 'usage', icon: '🧩', unit: '%', rows: [{ label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }] },
]

function applyPreset(p) {
  name.value = t('copil_ps_' + p.key)
  unit.value = p.unit || ''
  target.value = p.target ?? ''
  if (p.months) {
    const tag = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }[locale.value] || 'fr-FR'
    rows.value = Array.from({ length: p.months }, (_, i) => ({ label: new Date(2026, i, 1).toLocaleDateString(tag, { month: 'short' }), value: '' }))
  } else rows.value = p.rows.map(r => ({ ...r }))
  hint.value = 'auto'
}

const suggestion = computed(() => suggestBlock(name.value, rows.value, { unit: unit.value, target: target.value, hint: hint.value }))

function insert() {
  const block = buildMetricBlock(name.value, rows.value, { unit: unit.value, target: target.value, hint: hint.value })
  if (block) { emit('insert', block); emit('close') }
}
</script>

<style scoped>
.mw-overlay { position: fixed; inset: 0; background: rgba(15,15,35,0.55); display: flex; align-items: center; justify-content: center; z-index: 300; }
.mw { background: var(--bg-card); border-radius: 16px; padding: 24px; width: 560px; max-width: 94vw; max-height: 88vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.3); }
.mw-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.mw-head h3 { font-size: 1.05rem; font-weight: 800; }
.mw-close { background: none; border: none; cursor: pointer; font-size: 0.95rem; opacity: 0.5; }
.mw-close:hover { opacity: 1; }
.mw-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.mw-preset { background: var(--purple-bg); color: var(--purple); border: none; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.mw-preset:hover { background: var(--purple); color: #fff; }
.mw-row { display: flex; gap: 10px; margin-bottom: 12px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg.grow { flex: 1; }
.fg.sm { width: 90px; }
.fg label { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); }
.fi { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.fi:focus { border-color: var(--purple); }
.mw-values-label { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; display: block; margin: 14px 0 6px; }
.mw-vrow { display: grid; grid-template-columns: 1fr 120px 28px; gap: 8px; margin-bottom: 6px; align-items: center; }
.mw-del { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; }
.mw-del:hover { color: var(--red); }
.mw-add-row { background: none; border: 1px dashed var(--border); color: var(--text-secondary); padding: 6px; border-radius: 8px; font-size: 0.78rem; cursor: pointer; width: 100%; }
.mw-add-row:hover { border-color: var(--purple); color: var(--purple); }
.mw-types { display: flex; flex-wrap: wrap; gap: 6px; }
.mw-type { background: var(--bg); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 0.76rem; cursor: pointer; transition: all 0.15s; color: var(--text-secondary); }
.mw-type.active { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); font-weight: 700; }
.mw-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-light); }
.mw-suggest { font-size: 0.8rem; color: var(--text-secondary); }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
/* "Client data" source (client_metrics batch 22/07) */
.mw-client { margin-bottom: 4px; padding: 10px; background: var(--purple-bg); border: 1px solid var(--purple-border); border-radius: 10px; }
.mw-use { background: var(--purple); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
.mw-use:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
