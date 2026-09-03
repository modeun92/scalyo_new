<template>
  <div class="legal-page">
    <div class="legal-container">
      <h1>{{ t.dpa_title }}</h1>
      <p class="legal-subtitle">{{ t.dpa_subtitle }}</p>
      <p class="legal-updated">{{ t.dpa_last_updated }}</p>
      <p class="legal-intro">{{ t.dpa_intro }}</p>

      <section v-for="s in sections" :key="s">
        <h2>{{ t[`dpa_s${s}_title`] }}</h2>
        <p>{{ t[`dpa_s${s}_body`] }}</p>
        <template v-if="s === 7">
          <ul class="dpa-subs">
            <li>{{ t.dpa_s7_sub1 }}</li>
            <li>{{ t.dpa_s7_sub2 }}</li>
            <li>{{ t.dpa_s7_sub3 }}</li>
            <li>{{ t.dpa_s7_sub4 }}</li>
            <li>{{ t.dpa_s7_sub5 }}</li>
          </ul>
          <p class="dpa-sub-footer">{{ t.dpa_s7_footer }}</p>
        </template>
      </section>

      <div class="dpa-actions">
        <button class="btn-print" @click="printPage">{{ t.dpa_print }}</button>
        <router-link to="/cgu" class="legal-link">CGU</router-link>
        <router-link to="/privacy" class="legal-link">Privacy</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { DPA } from '@/i18n/dpa'

const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

function detectLocale() {
  try {
    const stored = localStorage.getItem('scalyo_locale')
    if (stored && DPA[stored]) return stored
  } catch {}
  const nav = navigator.language?.substring(0, 2)
  if (nav === 'ko' || nav === 'kr') return 'ko'
  if (nav === 'en') return 'en'
  return 'fr'
}

const locale = detectLocale()
const t = computed(() => DPA[locale] || DPA.fr)

function printPage() {
  window.print()
}
</script>

<style scoped>
.legal-page {
  min-height: 100vh;
  background: #f8f9fa;
  padding: 48px 24px;
}
.legal-container {
  max-width: 720px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  padding: 48px 40px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1a1a2e;
}
.legal-subtitle {
  font-size: 15px;
  color: #7c5cfc;
  font-weight: 500;
  margin-bottom: 4px;
}
.legal-updated {
  font-size: 13px;
  color: #999;
  margin-bottom: 24px;
}
.legal-intro {
  font-size: 15px;
  line-height: 1.7;
  color: #444;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}
section {
  margin-bottom: 28px;
}
h2 {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 10px;
}
section p {
  font-size: 14px;
  line-height: 1.75;
  color: #555;
}
.dpa-subs {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}
.dpa-subs li {
  font-size: 13px;
  color: #555;
  padding: 8px 0 8px 20px;
  border-left: 3px solid #7c5cfc;
  margin-bottom: 6px;
  line-height: 1.5;
}
.dpa-sub-footer {
  font-size: 13px;
  color: #888;
  font-style: italic;
  margin-top: 8px;
}
.dpa-actions {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 16px;
}
.btn-print {
  padding: 10px 24px;
  background: #7c5cfc;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.btn-print:hover {
  background: #6a4ce0;
}
.legal-link {
  font-size: 14px;
  color: #7c5cfc;
  text-decoration: none;
}
.legal-link:hover {
  text-decoration: underline;
}
@media print {
  .legal-page { padding: 0; background: #fff; }
  .legal-container { box-shadow: none; padding: 24px; }
  .dpa-actions { display: none; }
}
@media (max-width: 640px) {
  .legal-container { padding: 24px 20px; }
  h1 { font-size: 22px; }
}
</style>
