<template>
  <div class="pb-empty">
    <div class="empty-icon">📋</div>
    <h3>{{ t('pb_empty_title') }}</h3>
    <p>{{ t('pb_empty_desc') }}</p>
    <button class="btn-primary" @click="$emit('activate')">
      {{ t('pb_activate') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })
defineEmits(['activate'])
</script>
