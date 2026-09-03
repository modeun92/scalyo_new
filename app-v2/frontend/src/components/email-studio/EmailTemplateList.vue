<template>
  <div class="es-left">
    <div class="es-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="es-tab"
        :class="{ active: activeTab === tab.key }"
        @click="$emit('update:activeTab', tab.key)"
      >
        {{ t(tab.label) }}
      </button>
    </div>

    <div class="es-search">
      <span>🔍</span>
      <input v-model="localSearch" :placeholder="t('es_search')" />
    </div>

    <div class="es-cats">
      <button
        v-for="cat in categoryKeys"
        :key="cat"
        class="es-cat"
        :class="{ active: activeCat === cat, [catClass(cat)]: true }"
        @click="$emit('update:activeCat', activeCat === cat ? 'all' : cat)"
      >
        {{ cat === 'all' ? t('es_cat_all') : t('es_cat_' + cat) }}
      </button>
    </div>

    <div class="es-list">
      <div
        v-for="tpl in filteredTemplates"
        :key="tpl.id"
        class="es-item"
        :class="{ active: selectedId === tpl.id }"
        @click="$emit('update:selectedId', tpl.id)"
      >
        <span class="esi-cat" :class="catClass(tpl.categoryKey)">
          {{ t('es_cat_' + tpl.categoryKey) }}
        </span>
        <!-- CR-D : templates custom = nom stocké, defaults = clé i18n -->
        <strong>{{ tpl.nameKey ? t(tpl.nameKey) : tpl.name }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { templates, catClass } from './emailTemplates.js'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  activeTab: { type: String, required: true },
  activeCat: { type: String, required: true },
  selectedId: { type: [Number, String], default: null }, // CR-D : ids custom = uuid string
  search: { type: String, default: '' },
  customTemplates: { type: Array, default: () => [] } // CR-D : la prop était passée mais jamais consommée
})

const emit = defineEmits(['update:activeTab', 'update:activeCat', 'update:selectedId', 'update:search'])

const localSearch = ref(props.search)
watch(localSearch, (val) => emit('update:search', val))

const tabs = [
  { key: 'all', label: 'es_tab_all' },
  { key: 'csm', label: 'es_tab_csm' },
  { key: 'commercial', label: 'es_tab_commercial' },
  { key: 'kam', label: 'es_tab_kam' },
  { key: 'history', label: 'es_tab_history' }
]

const categoryKeys = computed(() => {
  const keys = [...new Set(templates.map(tpl => tpl.categoryKey))]
  if (props.customTemplates.length) keys.push('custom')
  return ['all', ...new Set(keys)]
})

// CR-D : les templates custom rejoignent la liste (forme alignée sur allTemplates du store)
const customAsItems = computed(() => props.customTemplates.map(tpl => ({
  id: tpl.id,
  nameKey: null,
  name: tpl.name,
  categoryKey: tpl.category || 'custom',
  type: tpl.type || null,
})))

const filteredTemplates = computed(() => {
  let list = [...templates, ...customAsItems.value]
  if (props.activeTab !== 'all' && props.activeTab !== 'history') {
    list = list.filter(tpl => tpl.type === props.activeTab)
  }
  if (props.activeCat !== 'all') {
    list = list.filter(tpl => tpl.categoryKey === props.activeCat)
  }
  if (localSearch.value) {
    const q = localSearch.value.toLowerCase()
    list = list.filter(tpl =>
      (tpl.nameKey ? t(tpl.nameKey) : (tpl.name || '')).toLowerCase().includes(q) ||
      t('es_cat_' + tpl.categoryKey).toLowerCase().includes(q)
    )
  }
  return list
})
</script>
