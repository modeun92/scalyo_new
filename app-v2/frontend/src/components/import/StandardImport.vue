<template>
  <div class="std_import">
    <!-- STEP 1: Upload -->
    <div v-if="step === 'upload'" class="import_drop"
      :class="{ dragover }"
      @dragover.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
    >
      <input ref="fileInput" type="file" accept=".csv,.xlsx,.xls,.xlsm,.json,.tsv,.txt" hidden @change="onFileSelect" />
      <div class="drop_inner" @click="fileInput?.click()">
        <span class="drop_icon">📁</span>
        <p class="drop_label">{{ t('import_drop_label') }}</p>
        <p class="drop_hint">CSV, XLSX, JSON</p>
      </div>
    </div>

    <!-- STEP 2: Mapping -->
    <div v-if="step === 'mapping'" class="import_mapping">
      <div class="mapping_header">
        <h3>{{ t('import_mapping_title') }}</h3>
        <span class="mapping_file">{{ parsed?.fileName }} — {{ parsed?.rowCount }} {{ t('import_rows') }}</span>
      </div>
      <div class="mapping_grid">
        <div v-for="field in fields" :key="field.key" class="mapping_row">
          <label class="mapping_label">
            {{ t(field.label) }}
            <span v-if="field.required" class="mapping_req">*</span>
          </label>
          <select v-model="mapping[field.key]" class="mapping_select">
            <option value="">— {{ t('import_skip') }} —</option>
            <option v-for="h in parsed?.headers" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>
      <p v-if="mappingError" class="mapping_error">{{ mappingError }}</p>
      <div class="mapping_actions">
        <button class="button_secondary" @click="reset()">{{ t('import_cancel') }}</button>
        <button class="button_primary" @click="goPreview()">{{ t('import_preview') }}</button>
      </div>
    </div>

    <!-- STEP 3: Preview -->
    <div v-if="step === 'preview'" class="import_preview">
      <div class="preview_header">
        <h3>{{ t('import_preview_title') }}</h3>
        <span>{{ previewRows.length }} / {{ mapped.length }} {{ t('import_rows') }}</span>
      </div>
      <div class="preview_table_wrapper">
        <table class="standard_import_preview_table">
          <thead>
            <tr>
              <th v-for="field in mappedFields" :key="field.key">{{ t(field.label) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in previewRows" :key="i">
              <td v-for="field in mappedFields" :key="field.key">{{ row[field.key] ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="importIssues.length" class="import_issues">
        <div class="ii_title">{{ t('import_warn_title', { count: importIssues.length }) }}</div>
        <ul>
          <li v-for="(iss, i) in importIssues.slice(0, 5)" :key="i">
            {{ t('import_warn_row', { row: iss.row, field: iss.field, value: iss.value }) }}
          </li>
        </ul>
        <p v-if="importIssues.length > 5" class="ii_more">
          {{ t('import_warn_more', { count: importIssues.length - 5 }) }}
        </p>
      </div>
      <div class="mapping_actions">
        <button class="button_secondary" @click="step = 'mapping'">{{ t('import_back') }}</button>
        <button class="button_primary" :disabled="importing" @click="doImport()">
          {{ importing ? t('import_importing') : t('import_confirm', { count: mapped.length }) }}
        </button>
      </div>
    </div>

    <!-- STEP 4: Done -->
    <div v-if="step === 'done'" class="import_done">
      <span class="done_icon">✅</span>
      <p>{{ t('import_done', { count: importedCount }) }}</p>
      <button class="button_secondary" @click="reset()">{{ t('import_new') }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseImportFile } from '@/utils/parseImportFile'

var props = defineProps({
  fields: { type: Array, required: true },
  onImport: { type: Function, required: true },
})

var { t } = useI18n({ useScope: 'global' })

var step = ref('upload')
var dragover = ref(false)
var fileInput = ref(null)
var parsed = ref(null)
var mapping = ref({})
var mapped = ref([])
var mappingError = ref('')
var importIssues = ref([])   // IMPORT-NUM: rejected values, never silent
var importing = ref(false)
var importedCount = ref(0)

var onDrop = async function (e) {
  dragover.value = false
  var file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

var onFileSelect = async function (e) {
  var file = e.target?.files?.[0]
  if (file) processFile(file)
}

var processFile = async function (file) {
  try {
    parsed.value = await parseImportFile(file)
    autoMap()
    step.value = 'mapping'
  } catch (err) {
    mappingError.value = t('import_parse_error')
  }
}

var normalize = function (str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

var autoMap = function () {
  var m = {}
  var headers = parsed.value?.headers || []
  var nh = headers.map(function (h) { return { raw: h, norm: normalize(h) } })
  props.fields.forEach(function (field) {
    var targets = [normalize(field.key), ...(field.aliases || []).map(normalize)]
    var match = nh.find(function (h) {
      return targets.some(function (t) {
        if (h.norm === t) return true
        // Only use includes matching if target is 4+ chars and covers 60%+ of the longer string
        var minLen = Math.min(t.length, h.norm.length)
        var maxLen = Math.max(t.length, h.norm.length)
        if (minLen < 4 || minLen / maxLen < 0.6) return false
        return h.norm.includes(t) || t.includes(h.norm)
      })
    })
    m[field.key] = match ? match.raw : ''
  })
  mapping.value = m
}

var mappedFields = computed(function () {
  return props.fields.filter(function (f) { return mapping.value[f.key] })
})

var goPreview = function () {
  var required = props.fields.filter(function (f) { return f.required })
  var missing = required.filter(function (f) { return !mapping.value[f.key] })
  if (missing.length) {
    mappingError.value = t('import_required_fields') + ' ' + missing.map(function (f) { return t(f.label) }).join(', ')
    return
  }
  mappingError.value = ''
  mapped.value = buildMapped()
  step.value = 'preview'
}

var buildMapped = function () {
  var rows = parsed.value?.rows || []
  var issues = []
  var out = rows.map(function (row, idx) {
    var obj = {}
    props.fields.forEach(function (field) {
      var col = mapping.value[field.key]
      if (col && row[col] !== undefined && row[col] !== '') {
        var v = castValue(row[col], field.type)
        if (v === UNPARSED) {
          // IMPORT-NUM: unintelligible value. We do not invent it, we do not
          // import it, we report it to the user. idx + 2 = the row
          // number in the spreadsheet (row 1 carries the headers).
          issues.push({ row: idx + 2, field: t(field.label), value: String(row[col]).slice(0, 40) })
          return
        }
        obj[field.key] = v
      }
    })
    return obj
  }).filter(function (obj) {
    return props.fields.filter(function (f) { return f.required }).every(function (f) { return obj[f.key] })
  })
  importIssues.value = issues
  return out
}

var normalizeStatus = {
  'non commence': 'todo', 'not started': 'todo', 'a faire': 'todo', 'todo': 'todo',
  'backlog': 'todo', 'nouveau': 'todo', 'new': 'todo', 'open': 'todo',
  'en cours': 'in_progress', 'in progress': 'in_progress', 'doing': 'in_progress',
  'started': 'in_progress', 'wip': 'in_progress',
  'termine': 'done', 'done': 'done', 'finished': 'done', 'complete': 'done',
  'fini': 'done', 'clos': 'done', 'closed': 'done',
  'bloque': 'blocked', 'blocked': 'blocked', 'en attente': 'blocked',
  'on hold': 'blocked', 'pending': 'blocked',
  'healthy': 'healthy', 'sain': 'healthy', 'en forme': 'healthy', 'ok': 'healthy', 'green': 'healthy', 'vert': 'healthy',
  'watch': 'watch', 'at_risk': 'watch', 'at risk': 'watch', 'at-risk': 'watch', 'a risque': 'watch', 'vigilance': 'watch', 'a surveiller': 'watch', 'surveiller': 'watch',
  'critical': 'critical', 'critique': 'critical', 'alerte': 'critical', 'danger': 'critical', 'red': 'critical', 'rouge': 'critical',
}


var normalizePriority = {
  'urgent important': 'urgent_important', 'urgent + important': 'urgent_important',
  'do now': 'urgent_important', 'do first': 'urgent_important', 'critical': 'urgent_important',
  'important non urgent': 'important', 'important non-urgent': 'important', 'important not urgent': 'important',
  'schedule': 'important', 'planifier': 'important',
  'urgent non important': 'urgent', 'urgent non-important': 'urgent', 'urgent not important': 'urgent',
  'delegate': 'urgent', 'deleguer': 'urgent',
  'ni urgent ni important': 'not_urgent', 'not urgent': 'not_urgent', 'eliminate': 'not_urgent',
  'eliminer': 'not_urgent', 'low': 'not_urgent',
  'urgent_important': 'urgent_important', 'important': 'important', 'urgent': 'urgent', 'not_urgent': 'not_urgent',
}

var cleanText = function (s) {
  return String(s).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, '').trim()
}

// IMPORT-NUM: Number('124 500,00') and Number('7,5') evaluate to NaN, and the old code
// SILENTLY fell back to 0. An ARR of EUR 124,500 was imported as 0 and then
// propagated into the portfolio ARR, the KPIs and the health score with no warning.
// Real and frequent cases: French CRM exports, Google Sheets, a copy-pasted column
// — all produce TEXT cells with a decimal comma and a non-breaking space.
// The rule from now on: we normalize, and if the value remains unintelligible we do
// NOT import it and we report it. Never an invented value.
var UNPARSED = Symbol('unparsed')

var parseNumeric = function (val) {
  if (typeof val === 'number') return isFinite(val) ? val : UNPARSED
  var s = cleanText(val)
  if (!s) return UNPARSED
  // Parentheses comptables = negatif : (1 500) -> -1500
  var negParen = /^\(.*\)$/.test(s)
  if (negParen) s = s.replace(/^\(|\)$/g, '')
  // Currency symbols, percent sign, every form of space (including U+00A0
  // non-breaking and U+202F narrow), Swiss thousands apostrophe.
  s = s.replace(/[\u20ac$\u00a3\u00a5\u20a9%\s\u00a0\u202f\u2009'\u2019]/g, '')
  if (!s) return UNPARSED
  var neg = negParen || /^-/.test(s)
  s = s.replace(/^[+-]/, '')
  var hasComma = s.indexOf(',') !== -1
  var hasDot = s.indexOf('.') !== -1
  if (hasComma && hasDot) {
    // The last separator encountered is the decimal one, the other groups thousands.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    // ',' as a thousands separator only if the grouping is VALID:
    // first group of 1 to 3 digits, all following ones exactly 3 (1,500 /
    // 1,234,567). Otherwise a French decimal comma (7,5 / 12,50 / 1234,567).
    // '12,3,4' is neither: rejected rather than guessed.
    var groups = s.split(',')
    var thousands = groups.length > 1 && /^\d{1,3}$/.test(groups[0]) &&
      groups.slice(1).every(function (g) { return /^\d{3}$/.test(g) })
    if (groups.length > 2) {
      if (!thousands) return UNPARSED
      s = s.replace(/,/g, '')
    } else if (thousands && groups[1].length === 3) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(',', '.')
    }
  }
  if (!/^\d*\.?\d+$/.test(s)) return UNPARSED
  var n = Number(s)
  if (!isFinite(n)) return UNPARSED
  return neg ? -n : n
}

var parseDate = function (val) {
  var s = cleanText(val)
  if (!s) return ''
  var rel = s.match(/^[jJdD]\+(\d+)$/)
  if (rel) { var d0 = new Date(); d0.setDate(d0.getDate() + Number(rel[1])); return d0.toISOString().slice(0, 10) }
  var parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (parts) {
    var iso = parts[3] + '-' + parts[2].padStart(2, '0') + '-' + parts[1].padStart(2, '0')
    // IMPORT-NUM: '31/02/2026' produced '2026-02-31', a date that does not exist.
    // Postgres rejects it and the whole import failed with an opaque error.
    var chk = new Date(iso + 'T00:00:00Z')
    return (!isNaN(chk.getTime()) && chk.toISOString().slice(0, 10) === iso) ? iso : ''
  }
  var d = new Date(s)
  return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''
}

var castValue = function (val, type) {
  if (type === 'integer') { var ni = parseNumeric(val); return ni === UNPARSED ? UNPARSED : Math.round(ni) }
  if (type === 'number') { return parseNumeric(val) }
  if (type === 'status') {
    var key = cleanText(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    return normalizeStatus[key] || 'todo'
  }
  if (type === 'priority') {
    var key = cleanText(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    return normalizePriority[key] || 'important'
  }
  if (type === 'date') { var dv = parseDate(val); return dv || UNPARSED }
  if (type === 'tags') {
    if (Array.isArray(val)) return val
    return String(val).split(/[,;|]/).map(function (s) { return s.trim() }).filter(Boolean)
  }
  return String(val).trim()
}

var previewRows = computed(function () { return mapped.value.slice(0, 5) })

var doImport = async function () {
  importing.value = true
  mappingError.value = ''
  try {
    var count = await props.onImport(mapped.value)
    if (count === null || count === undefined) count = mapped.value.length
    importedCount.value = count
    if (count > 0) {
      step.value = 'done'
    } else {
      mappingError.value = t('import_error')
      step.value = 'preview'
    }
  } catch (err) {
    console.error('[StandardImport] doImport error:', err)
    mappingError.value = t('import_error')
    step.value = 'preview'
  }
  importing.value = false
}

var reset = function () {
  step.value = 'upload'
  parsed.value = null
  mapping.value = {}
  mapped.value = []
  importIssues.value = []
  mappingError.value = ''
  importing.value = false
  importedCount.value = 0
}
</script>

<style scoped>
.std_import { max-width: 640px; margin: 0 auto; }
.import_drop { border: 2px dashed var(--border); border-radius: var(--radius-md); padding: 48px 24px; text-align: center; cursor: pointer; transition: all 0.2s; }
.import_drop:hover, .import_drop.dragover { border-color: var(--purple); background: var(--purple-bg); }
.drop_icon { font-size: 2rem; display: block; margin-bottom: 8px; }
.drop_label { font-weight: 600; color: var(--text); margin: 0 0 4px; }
.drop_hint { font-size: 0.8rem; color: var(--text-muted); margin: 0; }
.mapping_header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
.mapping_header h3 { font-size: 1rem; font-weight: 700; margin: 0; }
.mapping_file { font-size: 0.8rem; color: var(--text-muted); }
.mapping_grid { display: flex; flex-direction: column; gap: 8px; }
.mapping_row { display: flex; align-items: center; gap: 12px; }
.mapping_label { width: 160px; font-size: 0.85rem; font-weight: 500; flex-shrink: 0; }
.mapping_req { color: var(--red); }
.mapping_select { flex: 1; padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; background-color: var(--bg-card); }
.mapping_error { color: var(--red); font-size: 0.82rem; margin-top: 12px; }
/* IMPORT-NUM: non-blocking warning — the import is still possible, but
   the user sees exactly what was not taken in. */
/* Theme variables (main.css): --amber #ffb020, --amber-bg, --amber-border. */
.import_issues { margin-top: 14px; padding: 12px 14px; border-radius: 10px;
  background: var(--amber-bg); border: 1px solid var(--amber-border); }
/* Titre en <div> et non en <p> : main.css L272 impose
   [data-theme="dark"] p { color: #cbd5e1 !important }, qu'aucune specificite ne
   peut battre. On evite la regle plutot que d'empiler un !important de plus. */
.import_issues .ii_title { font-size: 0.82rem; font-weight: 600; margin: 0 0 6px; color: var(--amber); }
.import_issues ul { margin: 0; padding-left: 18px; }
.import_issues li { font-size: 0.78rem; line-height: 1.6; opacity: 0.85; }
.import_issues .ii_more { font-size: 0.75rem; opacity: 0.65; margin: 6px 0 0; }
.mapping_actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.button_primary { padding: 8px 20px; border: none; border-radius: var(--radius-sm); background: var(--purple); color: #fff; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: opacity 0.15s; }
.button_primary:hover { opacity: 0.9; }
.button_primary:disabled { opacity: 0.5; cursor: not-allowed; }
.button_secondary { padding: 8px 20px; border: 1px solid var(--border); border-radius: var(--radius-sm); background-color: var(--bg-card); color: var(--text); font-weight: 500; font-size: 0.85rem; cursor: pointer; transition: background 0.15s; }
.button_secondary:hover { background: var(--bg-hover); }
.preview_header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.preview_header h3 { font-size: 1rem; font-weight: 700; margin: 0; }
.preview_header span { font-size: 0.8rem; color: var(--text-muted); }
.preview_table_wrapper { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.standard_import_preview_table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.standard_import_preview_table th { text-align: left; padding: 8px 10px; background: var(--bg-hover); font-weight: 600; white-space: nowrap; border-bottom: 1px solid var(--border); }
.standard_import_preview_table td { padding: 6px 10px; border-bottom: 1px solid var(--border-light); }
.import_done { text-align: center; padding: 48px 24px; }
.done_icon { font-size: 2.5rem; display: block; margin-bottom: 12px; }
.import_done p { font-size: 1rem; font-weight: 600; margin: 0 0 20px; }
</style>
