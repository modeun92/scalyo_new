<template>
  <div class="pb-header">
    <div>
      <h1>📋 {{ t('pb_title') }}</h1>
      <span class="pb-counter">{{ playbookCount }} {{ t('pb_label') }}</span>
    </div>
    <div class="pb-actions">
      <div class="search-box">
        <span>🔍</span>
        <input
          :value="search"
          @input="$emit('update:search', $event.target.value)"
          :placeholder="t('search')"
        />
      </div>
      <button class="btn-primary" @click="$emit('openTemplates')">
        {{ t('pb_add') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  playbookCount: { type: Number, default: 0 },
  search: { type: String, default: '' }
})
defineEmits(['update:search', 'openTemplates'])
</script>
