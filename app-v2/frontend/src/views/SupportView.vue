<template>
  <div class="support-page">
    <div class="support-container">
      <header class="support-header">
        <h1>{{ m.support_title }}</h1>
        <p class="support-sub">{{ m.support_subtitle }}</p>
      </header>
      <section class="support-card">
        <p class="support-pitch">{{ m.support_pitch }}</p>
      </section>
      <div class="support-grid">
        <section class="support-card">
          <h2>{{ m.support_email_label }}</h2>
          <a href="mailto:contact@scalyo.app" class="support-email">contact@scalyo.app</a>
        </section>
        <section class="support-card">
          <h2>{{ m.support_response_title }}</h2>
          <p>{{ m.support_response_desc }}</p>
        </section>
        <section class="support-card">
          <h2>{{ m.support_langs_label }}</h2>
          <p>{{ m.support_langs_desc }}</p>
        </section>
      </div>
      <section class="support-card support-privacy">
        <h2>{{ m.support_privacy_title }}</h2>
        <p>{{ m.support_privacy_desc }}</p>
      </section>
      <section class="support-card support-legal">
        <h2>{{ m.support_legal_title }}</h2>
        <div class="legal-links">
          <a href="/cgu">{{ m.support_cgu_link }}</a>
          <a href="/privacy">{{ m.support_privacy_link }}</a>
        </div>
      </section>
      <div class="support-back">
        <a href="/">{{ m.support_back }}</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import fr from '@/i18n/fr'
import en from '@/i18n/en'
import ko from '@/i18n/ko'

function detectLocale() {
  try {
    const stored = window.localStorage?.getItem('scalyo_locale')
    if (stored && ['fr', 'en', 'ko'].includes(stored)) return stored
  } catch {}
  const lang = navigator.language?.substring(0, 2)
  if (lang === 'ko') return 'ko'
  if (lang === 'en') return 'en'
  return 'fr'
}

const locale = ref(detectLocale())
const msgs = { fr, en, ko }
const m = computed(() => msgs[locale.value] || msgs.fr)
onMounted(() => { document.title = m.value.support_title + ' \u2014 Scalyo' })
</script>

<style scoped>
.support-page { min-height: 100vh; background: #f8f9fa; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.support-container { max-width: 640px; width: 100%; }
.support-header { text-align: center; margin-bottom: 2rem; }
.support-header h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.25rem; }
.support-sub { color: #6b7280; font-size: 0.95rem; }
.support-card { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; border: 1px solid #e5e7eb; }
.support-pitch { line-height: 1.7; color: #1f2937; }
.support-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
.support-grid .support-card h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 0.5rem; }
.support-email { font-size: 1.1rem; font-weight: 600; color: #6366f1; text-decoration: none; }
.support-email:hover { text-decoration: underline; }
.support-privacy { border-left: 3px solid #6366f1; }
.support-privacy h2 { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
.support-legal h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 0.75rem; }
.legal-links { display: flex; gap: 1.5rem; }
.legal-links a { color: #6366f1; text-decoration: none; font-weight: 500; }
.legal-links a:hover { text-decoration: underline; }
.support-back { text-align: center; margin-top: 2rem; }
.support-back a { color: #6b7280; text-decoration: none; font-size: 0.9rem; }
.support-back a:hover { color: #6366f1; }
</style>