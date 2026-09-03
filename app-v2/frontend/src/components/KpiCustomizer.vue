<template>
  <SlideOver :open="open" :title="t('kpi_cust_title')" @close="$emit('close')" :width="480">
    <div class="kc-body">
      <p class="kc-sub">{{ t('kpi_cust_subtitle') }}</p>

      <!-- Filters -->
      <div class="kc-filters">
        <button v-for="r in roleFilters" :key="r.key" class="kc-pill" :class="{ active: roleFilter === r.key }" @click="roleFilter = r.key">{{ r.label }}</button>
      </div>

      <!-- Search -->
      <div class="kc-search"><span>🔍</span><input v-model="search" :placeholder="t('search')" /></div>

      <!-- Selected (drag to reorder) -->
      <div class="kc-selected-header">{{ t('kpi_cust_selected', { n: selected.length }) }}</div>
      <div class="kc-selected-list">
        <div v-for="(id, i) in selected" :key="id" class="kc-sel-item" draggable="true" @dragstart="dragIdx = i" @dragover.prevent @drop="onDrop(i)">
          <span class="kc-drag">⠿</span>
          <span class="kc-sel-label">{{ kpiLabel(id) }}</span>
          <button class="kc-sel-remove" @click="removeKpi(id)">✕</button>
        </div>
        <div v-if="!selected.length" class="kc-sel-empty">{{ t('kpi_cust_drag') }}</div>
      </div>

      <!-- Catalog grouped by category -->
      <div class="kc-catalog">
        <div v-for="cat in filteredCategories" :key="cat.id" class="kc-cat">
          <h4 class="kc-cat-title" @click="catOpen[cat.id] = !catOpen[cat.id]">
            <span>{{ catOpen[cat.id] ? '▾' : '▸' }}</span>
            {{ cat.icon }} {{ catLabel(cat) }}
            <span class="kc-cat-count">{{ catKpis(cat.id).length }}</span>
          </h4>
          <div v-if="catOpen[cat.id]" class="kc-cat-items">
            <label v-for="kpi in catKpis(cat.id)" :key="kpi.id" class="kc-kpi-item" :class="{ selected: selected.includes(kpi.id), disabled: selected.length >= 8 && !selected.includes(kpi.id) }">
              <input type="checkbox" :checked="selected.includes(kpi.id)" @change="toggleKpi(kpi.id)" :disabled="selected.length >= 8 && !selected.includes(kpi.id)" />
              <span class="kc-kpi-label">{{ kpiLabel(kpi.id) }}</span>
              <span v-if="kpi.source === 'manual'" class="kc-manual" :title="t('kpi_manual_hint')">✍️</span>
              <span v-if="kpi.recommended" class="kc-rec">⭐</span>
              <span class="kc-kpi-unit">{{ kpi.unit }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="selected.length >= 8" class="kc-max-warn">{{ t('kpi_cust_max') }}</div>

      <!-- Actions -->
      <div class="kc-actions">
        <button class="btn-outline" @click="resetDefaults">{{ t('kpi_cust_reset') }}</button>
        <button class="btn-primary" @click="apply">{{ t('kpi_cust_apply') }}</button>
      </div>
    </div>
  </SlideOver>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { KPI_CATALOG, KPI_CATEGORIES } from '@/data/kpiCatalog'
import SlideOver from '@/components/SlideOver.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  pageId: { type: String, required: true },
  defaults: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'update:modelValue'])

const { t, locale } = useI18n({ useScope: 'global' })

const search = ref('')
const roleFilter = ref('all')
const catOpen = reactive({})
const dragIdx = ref(null)

const selected = ref([...props.modelValue.length ? props.modelValue : props.defaults])

watch(() => props.open, (v) => {
  if (v) selected.value = [...props.modelValue.length ? props.modelValue : props.defaults]
})

const roleFilters = [
  { key: 'all', label: t('all') },
  { key: 'csm', label: 'CSM' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'kam', label: 'KAM' },
  { key: 'manager', label: 'Manager' },
]

const filteredKpis = computed(() => {
  let list = KPI_CATALOG
  if (roleFilter.value !== 'all') list = list.filter(k => k.roles?.includes(roleFilter.value))
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(k => k.label.toLowerCase().includes(q) || k.labelEN?.toLowerCase().includes(q) || k.id.includes(q))
  }
  return list
})

const filteredCategories = computed(() => {
  return KPI_CATEGORIES.filter(cat => filteredKpis.value.some(k => k.cat === cat.id))
})

function catKpis(catId) { return filteredKpis.value.filter(k => k.cat === catId) }

function catLabel(cat) {
  if (locale.value === 'en') return cat.labelEN
  if (locale.value === 'ko') return cat.labelKO
  return cat.labelFR
}

function kpiLabel(id) {
  const kpi = KPI_CATALOG.find(k => k.id === id)
  if (!kpi) return id
  if (locale.value === 'en') return kpi.labelEN || kpi.label
  if (locale.value === 'ko') return kpi.labelKO || kpi.label
  return kpi.label
}

function toggleKpi(id) {
  const idx = selected.value.indexOf(id)
  if (idx >= 0) selected.value.splice(idx, 1)
  else if (selected.value.length < 8) selected.value.push(id)
}

function removeKpi(id) {
  selected.value = selected.value.filter(k => k !== id)
}

function onDrop(targetIdx) {
  if (dragIdx.value == null || dragIdx.value === targetIdx) return
  const item = selected.value.splice(dragIdx.value, 1)[0]
  selected.value.splice(targetIdx, 0, item)
  dragIdx.value = null
}

function resetDefaults() { selected.value = [...props.defaults] }

function apply() {
  emit('update:modelValue', [...selected.value])
  emit('close')
}

// Open first 3 categories by default
KPI_CATEGORIES.slice(0, 3).forEach(c => { catOpen[c.id] = true })
</script>

<style scoped>
.kc-body { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px; overflow-y: auto; height: 100%; }
.kc-sub { font-size: 0.82rem; color: var(--text-secondary); flex-shrink: 0; }

.kc-filters { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
.kc-pill { background: var(--bg); border: none; padding: 5px 12px; border-radius: 999px; font-size: 0.75rem; cursor: pointer; color: var(--text-muted); transition: all 0.15s; }
.kc-pill.active { background: var(--purple); color: #fff; }

.kc-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 10px; flex-shrink: 0; }
.kc-search input { border: none; outline: none; padding: 8px 0; font-size: 0.82rem; width: 100%; background: transparent; }

.kc-selected-header { font-size: 0.75rem; font-weight: 700; color: var(--purple); flex-shrink: 0; }
.kc-selected-list { display: flex; flex-direction: column; gap: 4px; min-height: 40px; flex-shrink: 0; max-height: 200px; overflow-y: auto; }
.kc-sel-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--purple-bg); border: 1px solid var(--purple-border); border-radius: 6px; cursor: grab; font-size: 0.82rem; }
.kc-sel-item:active { cursor: grabbing; }
.kc-drag { color: var(--text-muted); font-size: 0.9rem; cursor: grab; }
.kc-sel-label { flex: 1; font-weight: 500; }
.kc-sel-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; padding: 0 4px; }
.kc-sel-remove:hover { color: var(--red); }
.kc-sel-empty { font-size: 0.78rem; color: var(--text-muted); text-align: center; padding: 12px; }

.kc-catalog { display: flex; flex-direction: column; gap: 4px; }
.kc-cat { background: var(--bg); border-radius: var(--radius-sm); overflow: hidden; }
.kc-cat-title { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 0.82rem; font-weight: 700; cursor: pointer; margin: 0; }
.kc-cat-title:hover { background: var(--bg-hover); }
.kc-cat-title span:first-child { font-size: 0.65rem; color: var(--text-muted); width: 12px; }
.kc-cat-count { font-size: 0.62rem; color: var(--text-muted); background: var(--bg-card); padding: 1px 6px; border-radius: 4px; margin-left: auto; }
.kc-cat-items { padding: 0 6px 6px; display: flex; flex-direction: column; gap: 2px; }
.kc-kpi-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; font-size: 0.78rem; cursor: pointer; background: var(--bg-card); }
.kc-kpi-item:hover { background: var(--purple-bg); }
.kc-kpi-item.selected { background: var(--purple-bg); border: 1px solid var(--purple-border); }
.kc-kpi-item.disabled { opacity: 0.4; cursor: not-allowed; }
.kc-kpi-item input { accent-color: var(--purple); }
.kc-kpi-label { flex: 1; }
.kc-rec { font-size: 0.65rem; }
.kc-manual { font-size: 0.62rem; opacity: 0.65; cursor: help; }
.kc-kpi-unit { font-size: 0.65rem; color: var(--text-muted); min-width: 24px; text-align: right; }

.kc-max-warn { font-size: 0.75rem; color: var(--amber); text-align: center; padding: 6px; background: var(--amber-bg); border-radius: 6px; }

.kc-actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 10px; border-top: 1px solid var(--border-light); flex-shrink: 0; }
.btn-outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 8px 16px; border-radius: var(--radius-sm); font-size: 0.82rem; cursor: pointer; }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 8px 16px; border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
</style>
