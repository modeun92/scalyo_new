<template>
  <div class="playbook_filters">
    <button
      v-for="f in filterTabs"
      :key="f.key"
      class="filter_tab"
      :class="{ active: activeFilter === f.key }"
      @click="$emit('update:activeFilter', f.key)"
    >
      {{ t(f.label) }}
      <span class="filter_count">{{ f.count }}</span>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  filterTabs: { type: Array, required: true },
  activeFilter: { type: String, default: 'all' }
})

defineEmits(['update:activeFilter'])
</script>
