<template>
  <router-view />
</template>

<script setup>
import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { setAppLocale } from '@/i18n'

const auth = useAuthStore()

// Apply the user's locale when the profile loads. REGIONAL-I18N (04/09): the locale is a LANGUAGE
// plus a COUNTRY — watch both, or a manager switching from France to Québec keeps reading `Devis`
// until the next full reload. The old `['fr','en','ko'].includes()` guard is now inside
// setAppLocale/resolveLocale: an unknown pair degrades to the base language there, once.
watch(() => [auth.userLocale, auth.userRegion], ([lang, region]) => {
  if (lang) setAppLocale(lang, region)
}, { immediate: true })
</script>
