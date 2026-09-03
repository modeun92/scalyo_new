<template>
  <div class="sv-panel">
    <!-- Language -->
    <div class="sv-section">
      <h3>🌐 {{ t('stg_lang_title') }}</h3>
      <p class="sv-note">{{ t('stg_lang_desc') }}</p>
      <div class="lang-cards">
        <button
          v-for="lang in langOptions"
          :key="lang.code"
          class="lang-card"
          :class="{ active: selectedLang === lang.code }"
          @click="changeLang(lang.code)"
        >
          <span class="lang-flag">{{ lang.flag }}</span>
          <span class="lang-name">{{ lang.name }}</span>
          <span v-if="selectedLang === lang.code" class="lang-check">✓</span>
        </button>
      </div>
      <p v-if="langSaved" class="stg-saved">✓ {{ t('stg_lang_saved') }}</p>
      <p v-if="langError" class="sv-field-error">{{ t('stg_lang_error') }}</p>
    </div>

    <!-- Theme -->
    <div class="sv-section">
      <h3>🌙 {{ t('stg_dark_title') }}</h3>
      <p class="sv-note">{{ t('stg_dark_desc') }}</p>
      <div class="theme-cards">
        <button
          class="theme-card"
          :class="{ active: theme === 'light' }"
          @click="setTheme('light')"
        >
          ☀️ {{ t('stg_theme_light') }}
        </button>
        <button
          class="theme-card"
          :class="{ active: theme === 'dark' }"
          @click="setTheme('dark')"
        >
          🌙 {{ t('stg_theme_dark') }}
        </button>
        <button
          class="theme-card"
          :class="{ active: theme === 'auto' }"
          @click="setTheme('auto')"
        >
          🖥️ {{ t('stg_theme_auto') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n({ useScope: 'global' })
const auth = useAuthStore()

/* ── Language ──────────────────────────────── */
const langOptions = [
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'ko', flag: '🇰🇷', name: '한국어' }
]

const selectedLang = ref(auth.userLocale || locale.value || 'fr')
const langSaved = ref(false)
const langError = ref(false)

async function changeLang(code) {
  const prev = auth.userLocale || 'fr'
  if (code === prev) return
  selectedLang.value = code
  locale.value = code
  langError.value = false
  const res = await auth.saveLocale(code)
  if (res && res.success) {
    langSaved.value = true
    setTimeout(() => { langSaved.value = false }, 2000)
  } else {
    // D-15 : échec d'écriture = jamais de faux succès — revert UI + erreur visible
    selectedLang.value = prev
    locale.value = prev
    langError.value = true
    setTimeout(() => { langError.value = false }, 4000)
  }
}

/* ── Theme ─────────────────────────────────── */
const theme = ref(localStorage.getItem('scalyo_theme') || 'auto')

function setTheme(value) {
  theme.value = value
  localStorage.setItem('scalyo_theme', value)
  applyTheme(value)
}

function applyTheme(value) {
  const root = document.documentElement
  if (value === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else if (value === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
}

applyTheme(theme.value)
</script>
