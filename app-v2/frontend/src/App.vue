<template>
  <router-view />
</template>

<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { startIdleWatch, touchActivity } from '@/lib/sessionIdle'
import { setAppLocale } from '@/i18n'

const auth = useAuthStore()
const router = useRouter()

// Apply the user's locale when the profile loads. REGIONAL-I18N (04/09): the locale is a LANGUAGE
// plus a COUNTRY — watch both, or a manager switching from France to Québec keeps reading `Devis`
// until the next full reload. The old `['fr','en','ko'].includes()` guard is now inside
// setAppLocale/resolveLocale: an unknown pair degrades to the base language there, once.
watch(() => [auth.userLocale, auth.userRegion], ([lang, region]) => {
  if (lang) setAppLocale(lang, region)
}, { immediate: true })

// IDLE-5H (07/09/2026): the running half of the 5 h idle bound — auth.init() only judges
// the session at boot, which would let a tab left open all weekend stay logged in forever.
// Mounted HERE, at the app root: it is the one component that outlives every route, and a
// watcher started per-view would be torn down and restarted on each navigation, resetting
// nothing but costing a listener churn on every click.
let stopIdleWatch = null

onMounted(() => {
  // A session restored by init() reaches this point already validated; stamping now marks
  // the boot itself as interaction so a fresh load never inherits an almost-spent window.
  if (auth.isAuthenticated) touchActivity(true)

  stopIdleWatch = startIdleWatch(async () => {
    console.info('[idle] 5 h without interaction — ending the session')
    // logout() before the redirect, and awaited: the guard on /login sends an
    // authenticated user straight back to the dashboard, so navigating first would
    // bounce the user into the app they were just expelled from.
    try { await auth.logout() } catch (e) { console.error('[idle] logout failed:', e?.message || e) }
    // replace, not push: the expired page must not come back on Back.
    router.replace({ name: 'login', query: { expired: '1' } })
  }, () => auth.isAuthenticated)
})

// The watch outlives no App instance, but stopping it explicitly keeps HMR and the test
// harness from stacking a second interval on every reload.
onBeforeUnmount(() => { if (stopIdleWatch) { stopIdleWatch(); stopIdleWatch = null } })
</script>
