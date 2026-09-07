<template>
  <div class="playbook_empty">
    <div class="empty_icon">📋</div>
    <h3>{{ t('playbook_empty_title') }}</h3>
    <p>{{ t('playbook_empty_desc') }}</p>
    <button class="button_primary" @click="$emit('activate')">
      {{ t('playbook_activate') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })
defineEmits(['activate'])
</script>
