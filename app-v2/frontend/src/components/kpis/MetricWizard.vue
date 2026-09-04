<template>
<div class="metric_wizard_overlay" @click.self="$emit('close')">
  <div class="mw">
    <div class="metric_wizard_header">
      <h3>✨ {{ t('copil_mw_title') }}</h3>
      <button class="metric_wizard_close" @click="$emit('close')">✕</button>
    </div>

    <!-- Business presets -->
    <div class="metric_wizard_presets">
      <button v-for="p in presets" :key="p.key" class="metric_wizard_preset" @click="applyPreset(p)">{{ p.icon }} {{ t('copil_ps_' + p.key) }}</button>
    </div>

    <!-- From the linked client's real measurements (client_metrics — contract 22/07) -->
    <div v-if="clientId && clientKpis.length" class="metric_wizard_client">
      <label class="metric_wizard_values_label">📊 {{ t('copil_mw_client_src') }}</label>
      <div class="metric_wizard_row">
        <select v-model="clientKpiId" class="field_input grow">
          <option value="">{{ t('cmet_pick') }}</option>
          <option v-for="k in clientKpis" :key="k.id" :value="k.id">{{ kpiLabel(k) }}</option>
        </select>
        <button class="metric_wizard_use" :disabled="!clientKpiId" @click="useClientSeries">{{ t('copil_mw_client_use') }}</button>
      </div>
    </div>

    <div class="metric_wizard_row">
      <div class="field_group grow"><label>{{ t('copil_mw_name') }}</label><input v-model="name" class="field_input" :placeholder="t('copil_mw_name_ph')" /></div>
      <div class="field_group small"><label>{{ t('copil_mw_unit') }}</label><input v-model="unit" class="field_input" placeholder="%" /></div>
      <div class="field_group small"><label>{{ t('copil_mw_target') }}</label><input v-model="target" type="number" step="any" class="field_input" /></div>
    </div>

    <label class="metric_wizard_values_label">{{ t('copil_mw_values') }}</label>
    <div v-for="(r, i) in rows" :key="i" class="metric_wizard_vrow">
      <input v-model="r.label" class="field_input" :placeholder="t('copil_mw_label')" />
      <input v-model="r.value" type="number" step="any" class="field_input" :placeholder="t('copil_mw_value')" />
      <button v-if="rows.length > 1" class="metric_wizard_delete" @click="rows.splice(i, 1)">✕</button>
    </div>
    <button class="metric_wizard_add_row" @click="rows.push({ label: '', value: '' })">+ {{ t('copil_mw_add_row') }}</button>

    <!-- Visual choice -->
    <label class="metric_wizard_values_label">{{ t('copil_mw_type') }}</label>
    <div class="metric_wizard_types">
      <button v-for="ty in types" :key="ty.key" class="metric_wizard_type" :class="{ active: hint === ty.key }" @click="hint = ty.key">
        {{ ty.icon }} {{ ty.key === 'auto' ? t('copil_mw_auto') : t(ty.labelKey) }}
      </button>
    </div>

    <div class="metric_wizard_foot">
      <span v-if="suggestion" class="metric_wizard_suggest">{{ t('copil_mw_suggest') }} : <strong>{{ t('copil_bt_' + suggestion.type) }}</strong></span>
      <button class="button_primary" :disabled="!suggestion" @click="insert">{{ t('copil_mw_insert') }}</button>
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
.metric_wizard_overlay { position: fixed; inset: 0; background: rgba(15,15,35,0.55); display: flex; align-items: center; justify-content: center; z-index: 300; }
.mw { background: var(--bg-card); border-radius: 16px; padding: 24px; width: 560px; max-width: 94vw; max-height: 88vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.3); }
.metric_wizard_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.metric_wizard_header h3 { font-size: 1.05rem; font-weight: 800; }
.metric_wizard_close { background: none; border: none; cursor: pointer; font-size: 0.95rem; opacity: 0.5; }
.metric_wizard_close:hover { opacity: 1; }
.metric_wizard_presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.metric_wizard_preset { background: var(--purple-bg); color: var(--purple); border: none; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.metric_wizard_preset:hover { background: var(--purple); color: #fff; }
.metric_wizard_row { display: flex; gap: 10px; margin-bottom: 12px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group.grow { flex: 1; }
.field_group.small { width: 90px; }
.field_group label { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }
.metric_wizard_values_label { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; display: block; margin: 14px 0 6px; }
.metric_wizard_vrow { display: grid; grid-template-columns: 1fr 120px 28px; gap: 8px; margin-bottom: 6px; align-items: center; }
.metric_wizard_delete { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; }
.metric_wizard_delete:hover { color: var(--red); }
.metric_wizard_add_row { background: none; border: 1px dashed var(--border); color: var(--text-secondary); padding: 6px; border-radius: 8px; font-size: 0.78rem; cursor: pointer; width: 100%; }
.metric_wizard_add_row:hover { border-color: var(--purple); color: var(--purple); }
.metric_wizard_types { display: flex; flex-wrap: wrap; gap: 6px; }
.metric_wizard_type { background: var(--bg); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 0.76rem; cursor: pointer; transition: all 0.15s; color: var(--text-secondary); }
.metric_wizard_type.active { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); font-weight: 700; }
.metric_wizard_foot { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-light); }
.metric_wizard_suggest { font-size: 0.8rem; color: var(--text-secondary); }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; }
.button_primary:disabled { opacity: 0.4; cursor: not-allowed; }
/* "Client data" source (client_metrics batch 22/07) */
.metric_wizard_client { margin-bottom: 4px; padding: 10px; background: var(--purple-bg); border: 1px solid var(--purple-border); border-radius: 10px; }
.metric_wizard_use { background: var(--purple); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
.metric_wizard_use:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
