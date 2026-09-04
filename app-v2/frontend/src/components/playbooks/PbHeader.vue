<template>
  <div class="playbook_header">
    <div>
      <h1>📋 {{ t('pb_title') }}</h1>
      <span class="playbook_counter">{{ playbookCount }} {{ t('pb_label') }}</span>
    </div>
    <div class="playbook_actions">
      <div class="search_box">
        <span>🔍</span>
        <input
          :value="search"
          @input="$emit('update:search', $event.target.value)"
          :placeholder="t('search')"
        />
      </div>
      <button class="button_primary" @click="$emit('openTemplates')">
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
