<template>
  <div class="sat-filters">
    <div class="filter-tabs">
      <button
        v-for="f in statusFilters"
        :key="f.key"
        class="ftab"
        :class="{ active: activeFilter === f.key }"
        @click="$emit('update:activeFilter', f.key)"
      >
        {{ t(f.label) }}
      </button>
    </div>

    <select :value="csmFilter" class="filter-select" @change="$emit('update:csmFilter', $event.target.value)">
      <option value="all">{{ t('sat_all_csm') }}</option>
      <option v-for="m in teamMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>

    <select :value="sortBy" class="filter-select" @change="$emit('update:sortBy', $event.target.value)">
      <option value="health">{{ t('sat_sort_health') }} ↑</option>
      <option value="health_desc">{{ t('sat_sort_health') }} ↓</option>
      <option value="arr">{{ t('sat_sort_arr') }} ↓</option>
    </select>

    <div class="search-box">
      <span>🔍</span>
      <input :value="search" :placeholder="t('search')" @input="$emit('update:search', $event.target.value)" />
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  statusFilters: { type: Array, required: true },
  activeFilter: { type: String, default: 'all' },
  csmFilter: { type: [String, Number], default: 'all' },
  sortBy: { type: String, default: 'health' },
  search: { type: String, default: '' },
  teamMembers: { type: Array, default: () => [] }
})

defineEmits(['update:activeFilter', 'update:csmFilter', 'update:sortBy', 'update:search'])
</script>
