<template>
  <router-view />
</template>

<script setup>
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { locale } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

// Apply user locale when profile loads
watch(() => auth.userLocale, (newLocale) => {
  if (newLocale && ['fr', 'en', 'ko'].includes(newLocale)) {
    locale.value = newLocale
  }
}, { immediate: true })
</script>
