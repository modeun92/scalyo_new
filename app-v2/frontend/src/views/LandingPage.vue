<template>
  <div ref="rootEl" class="landing">
    <!-- SEO-I18N: a suggestion, not a redirect. The label is in the proposed
         language, read from landing.js — no hard-coded text. -->
    <div v-if="suggestedLang" class="lang-hint">
      <button type="button" class="lang-hint-go" @click="acceptSuggestion">{{ suggestionText }}</button>
      <button type="button" class="lang-hint-x" :aria-label="suggestionDismiss" :title="suggestionDismiss" @click="dismissSuggestion">&times;</button>
    </div>

    <LandingNavbar
      :scrolled="scrolled"
      :locale="locale"
      :langs="langs"
      :app-url="appUrl"
      :home-path="homePath"
      :t="t"
      @locale-change="onLocaleChange"
    />

    <LandingHero :app-url="appUrl" :t="t" />

    <LandingMockupFrame
      :active-demo="activeDemo"
      :demo-tabs="demoTabs"
      :t="t"
      @demo-change="activeDemo = $event"
    >
      <template #default="{ activeDemoVal }">
        <LandingMockupPanels
          :active-demo="activeDemo"
          :mock-accounts="mockAccounts"
          :t="t"
        />
      </template>
    </LandingMockupFrame>

    <LandingStats :stats-data="statsData" :note="t('stats_note')" />

    <LandingFeatures
      :modules-data="modulesData"
      :active-module="activeModule"
      :app-url="appUrl"
      :t="t"
      @module-change="activeModule = $event"
    />

    <LandingRoiCalc :t="t" :locale="locale" />

    <LandingDifferentiators :pillars="pillars" :t="t" />

    <LandingWhyScalyo :selling-points="sellingPoints" :t="t" />

    <LandingPricing :t="t" />

    <LandingFaq :faq-items="faqItems" :t="t" />

    <LandingCta :app-url="appUrl" :t="t" />

    <LandingFooter :app-url="appUrl" :locale="locale" :t="t" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { L } from '@/i18n/landing'

import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import LandingHero from '@/components/landing/LandingHero.vue'
import LandingMockupFrame from '@/components/landing/LandingMockupFrame.vue'
import LandingMockupPanels from '@/components/landing/LandingMockupPanels.vue'
import LandingStats from '@/components/landing/LandingStats.vue'
import LandingFeatures from '@/components/landing/LandingFeatures.vue'
import LandingRoiCalc from '@/components/landing/LandingRoiCalc.vue'
import LandingDifferentiators from '@/components/landing/LandingDifferentiators.vue'
import LandingWhyScalyo from '@/components/landing/LandingWhyScalyo.vue'
import LandingPricing from '@/components/landing/LandingPricing.vue'
import LandingFaq from '@/components/landing/LandingFaq.vue'
import LandingCta from '@/components/landing/LandingCta.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'

const appUrl = ''

// SEO-I18N — the landing page language comes from the URL PREFIX, no longer from localStorage.
// The rendered body must say the same thing as the static <head> produced at build time:
// any divergence would make the canonical and the hreflang tags lie.
// Codes: the URL and the hreflang carry 'ko' (ISO 639-1); landing.js indexes its
// labels under 'kr'. route.meta.landingLocale already carries the landing.js key.
const route = useRoute()
const router = useRouter()
const { locale: globalLocale } = useI18n({ useScope: 'global' })
const KR2KO = (c) => (c === 'kr' ? 'ko' : c)

// Single source for the landing-key / path pair. A new language is added here
// and in the routes; nowhere else.
const LANG_PATHS = { fr: '/', en: '/en/', kr: '/ko/' }

const locale = ref(route.meta?.landingLocale || 'fr')
const homePath = computed(() => LANG_PATHS[locale.value] || '/')
watch(() => route.meta?.landingLocale, (v) => { if (v) locale.value = v })

const langs = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'kr', label: '한국어' },
]

// The language choice changes the URL: that is what makes the version shareable by
// link and indexable. localStorage is still written so that the ToS (global i18n locale)
// and the DPA (localStorage.scalyo_locale) follow the choice.
function onLocaleChange(code) {
  const mapped = KR2KO(code)
  globalLocale.value = mapped
  try { localStorage.setItem('scalyo_locale', mapped) } catch { /* stockage indisponible */ }
  const target = LANG_PATHS[code]
  if (target && target !== route.path) router.push(target)
  else locale.value = code
}

// Language suggestion — never an automatic redirect: it would trap the
// crawlers, which most often come from the United States. We propose, we do not decide.
// Only on the root URL, whose static head is French.
const suggestedLang = ref(null)
const suggestionText = computed(() => suggestedLang.value ? (L[suggestedLang.value]?.lang_switch_hint || '') : '')
const suggestionDismiss = computed(() => suggestedLang.value ? (L[suggestedLang.value]?.lang_switch_dismiss || '') : '')
function detectSuggestion() {
  if (route.path !== '/') return null
  try { if (sessionStorage.getItem('scalyo_lang_hint_off')) return null } catch { /* indisponible */ }
  let pref = ''
  try { pref = localStorage.getItem('scalyo_locale') || '' } catch { /* indisponible */ }
  const n = (pref || navigator.language || '').toLowerCase()
  if (n.startsWith('ko') || n.startsWith('kr')) return 'kr'
  if (n.startsWith('en')) return 'en'
  return null
}
function acceptSuggestion() {
  const c = suggestedLang.value
  suggestedLang.value = null
  if (c) onLocaleChange(c)
}
function dismissSuggestion() {
  suggestedLang.value = null
  try { sessionStorage.setItem('scalyo_lang_hint_off', '1') } catch { /* indisponible */ }
}
function t(key) {
  return (L[locale.value] || L.fr)[key] || L.fr[key] || key
}

const rootEl = ref(null)
const scrolled = ref(false)
const activeDemo = ref(0)
const activeModule = ref(0)

const demoTabs = [
  { key: 'dashboard', icon: '📊', labelKey: 'demo_dashboard' },
  { key: 'portfolio', icon: '🗂️', labelKey: 'demo_portfolio' },
  { key: 'coach',     icon: '🤖', labelKey: 'demo_coach' },
  { key: 'wellbeing', icon: '💚', labelKey: 'demo_wellbeing' },
  { key: 'email',     icon: '📧', labelKey: 'demo_email_head' },
  { key: 'planning',  icon: '📅', labelKey: 'fl_c6' },
  { key: 'tasks',     icon: '✅', labelKey: 'fl_c7' },
  { key: 'import',    icon: '🤖', labelKey: 'demo_import' },
  { key: 'resources', icon: '📚', labelKey: 'fl_c8' },
]

const mockAccounts = [
  { name: 'TechScale', health: 9.1, color: '#10b981' },
  { name: 'Acme Corp', health: 6.4, color: '#f59e0b' },
  { name: 'Biotech Group', health: 8.7, color: '#8b5cf6' },
  { name: 'Leroy Finance', health: 4.2, color: '#ef4444' },
]

// The values are localized (30j / 30d / 30일): never a literal in the component.
const statsData = computed(() => [
  { n: t('stat1v'), l: t('stat1'), s: t('stat1n'), icon: '📉' },
  { n: t('stat2v'), l: t('stat2'), s: t('stat2n'), icon: '📈' },
  { n: t('stat3v'), l: t('stat3'), s: t('stat3n'), icon: '⏱️' },
  { n: t('stat4v'), l: t('stat4'), s: t('stat4n'), icon: '🔮' },
])

const modulesData = computed(() => [
  { icon: '🗂️', chip: t('fl_c1'), tag: t('fl_m1tag'), h2: t('fl_m1h2'), body: t('fl_m1body'), points: [t('fl_m1p1'), t('fl_m1p2'), t('fl_m1p3'), t('fl_m1p4'), t('fl_m1p5')], btn: t('fl_m1btn') },
  { icon: '📊', chip: t('fl_c2'), tag: t('fl_m2tag'), h2: t('fl_m2h2'), body: t('fl_m2body'), points: [t('fl_m2p1'), t('fl_m2p2'), t('fl_m2p3'), t('fl_m2p4'), t('fl_m2p5')], btn: t('fl_m2btn') },
  { icon: '💚', chip: t('fl_c3'), tag: t('fl_m3tag'), h2: t('fl_m3h2'), body: t('fl_m3body'), points: [t('fl_m3p1'), t('fl_m3p2'), t('fl_m3p3'), t('fl_m3p4'), t('fl_m3p5')], btn: t('fl_m3btn') },
  { icon: '🤖', chip: t('fl_c4'), tag: t('fl_m4tag'), h2: t('fl_m4h2'), body: t('fl_m4body'), points: [t('fl_m4p1'), t('fl_m4p2'), t('fl_m4p3'), t('fl_m4p4'), t('fl_m4p5')], btn: t('fl_m4btn') },
  { icon: '📧', chip: t('fl_c5'), tag: t('fl_m5tag'), h2: t('fl_m5h2'), body: t('fl_m5body'), points: [t('fl_m5p1'), t('fl_m5p2'), t('fl_m5p3'), t('fl_m5p4'), t('fl_m5p5')], btn: t('fl_m5btn') },
  { icon: '📅', chip: t('fl_c6'), tag: t('fl_m6tag'), h2: t('fl_m6h2'), body: t('fl_m6body'), points: [t('fl_m6p1'), t('fl_m6p2'), t('fl_m6p3'), t('fl_m6p4'), t('fl_m6p5')], btn: t('fl_m6btn') },
  { icon: '✅', chip: t('fl_c7'), tag: t('fl_m7tag'), h2: t('fl_m7h2'), body: t('fl_m7body'), points: [t('fl_m7p1'), t('fl_m7p2'), t('fl_m7p3'), t('fl_m7p4'), t('fl_m7p5')], btn: t('fl_m7btn') },
  { icon: '📚', chip: t('fl_c8'), tag: t('fl_m8tag'), h2: t('fl_m8h2'), body: t('fl_m8body'), points: [t('fl_m8p1'), t('fl_m8p2'), t('fl_m8p3'), t('fl_m8p4'), t('fl_m8p5')], btn: t('fl_m8btn') },
])

const pillars = computed(() => [
  {
    accent: '#7c3aed', glow: 'rgba(124, 58, 237, 0.14)', icon: '🎯',
    tag: t('pillar1_tag'), title: t('pillar1_title'), sub: t('pillar1_sub'),
    points: [t('pillar1_p1'), t('pillar1_p2'), t('pillar1_p3')],
  },
  {
    accent: '#10b981', glow: 'rgba(16, 185, 129, 0.14)', icon: '🛡️',
    tag: t('pillar2_tag'), title: t('pillar2_title'), sub: t('pillar2_sub'),
    points: [t('pillar2_p1'), t('pillar2_p2'), t('pillar2_p3')],
  },
  {
    accent: '#3b82f6', glow: 'rgba(59, 130, 246, 0.14)', icon: '🌐',
    tag: t('pillar3_tag'), title: t('pillar3_title'), sub: t('pillar3_sub'),
    points: [t('pillar3_p1'), t('pillar3_p2'), t('pillar3_p3')],
  },
])

const sellingPoints = computed(() => [
  { icon: '🔮', label: t('sell_1_label'), desc: t('sell_1_desc') },
  { icon: '🧩', label: t('sell_2_label'), desc: t('sell_2_desc') },
  { icon: '🛡️', label: t('sell_3_label'), desc: t('sell_3_desc') },
  { icon: '⚡', label: t('sell_4_label'), desc: t('sell_4_desc') },
])

const faqItems = computed(() => [
  { q: t('faq_q1'), a: t('faq_a1') },
  { q: t('faq_q2'), a: t('faq_a2') },
  { q: t('faq_q3'), a: t('faq_a3') },
  { q: t('faq_q4'), a: t('faq_a4') },
  { q: t('faq_q5'), a: t('faq_a5') },
  { q: t('faq_q6'), a: t('faq_a6') },
  { q: t('faq_q7'), a: t('faq_a7') },
  { q: t('faq_q8'), a: t('faq_a8') },
  { q: t('faq_q9'), a: t('faq_a9') },
  { q: t('faq_q10'), a: t('faq_a10') },
  { q: t('faq_q11'), a: t('faq_a11') },
])

function onScroll() { scrolled.value = window.scrollY > 30 }

let observer = null
let demoCycleTimer = null
onMounted(() => {
  suggestedLang.value = detectSuggestion()
  window.addEventListener('scroll', onScroll, { passive: true })


  // Defer observer to ensure DOM layout is stable after Vue render
  // Reveal all sections — scroll animation disabled pending proper implementation
  setTimeout(() => {
    rootEl.value?.querySelectorAll('.anim-section').forEach(el => {
      el.classList.add('anim-visible')
    })
  }, 100)

  demoCycleTimer = setInterval(() => {
    activeDemo.value = (activeDemo.value + 1) % demoTabs.length
  }, 5000)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  observer?.disconnect()
  clearInterval(demoCycleTimer)
})
</script>

<style src="@/assets/landing.css"></style>

<style scoped>
.lang-hint {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 6px 14px;
  border-radius: 999px;
  background: rgba(17, 17, 27, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
}
.lang-hint-go,
.lang-hint-x {
  background: none;
  border: 0;
  color: #fff;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.lang-hint-go { font-size: 14px; font-weight: 600; padding: 6px 2px; }
.lang-hint-go:hover { text-decoration: underline; }
.lang-hint-x {
  font-size: 18px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  opacity: 0.6;
}
.lang-hint-x:hover { opacity: 1; background: rgba(255, 255, 255, 0.12); }
@media (max-width: 640px) {
  .lang-hint { right: 12px; bottom: 12px; }
}
</style>
