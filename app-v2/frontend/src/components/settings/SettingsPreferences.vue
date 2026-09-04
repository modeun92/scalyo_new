<template>
  <div class="settings_view_panel">
    <!-- Language -->
    <div class="settings_view_section">
      <h3>🌐 {{ t('stg_lang_title') }}</h3>
      <p class="settings_view_note">{{ t('stg_lang_desc') }}</p>
      <div class="language_cards">
        <button
          v-for="lang in langOptions"
          :key="lang.code"
          class="language_card"
          :class="{ active: selectedLang === lang.code }"
          @click="changeLang(lang.code)"
        >
          <span class="language_flag">{{ lang.flag }}</span>
          <span class="language_name">{{ lang.name }}</span>
          <span v-if="selectedLang === lang.code" class="language_check">✓</span>
        </button>
      </div>
      <p v-if="langSaved" class="settings_saved">✓ {{ t('stg_lang_saved') }}</p>
      <p v-if="langError" class="settings_view_field_error">{{ t('stg_lang_error') }}</p>
    </div>

    <!-- Theme -->
    <div class="settings_view_section">
      <h3>🌙 {{ t('stg_dark_title') }}</h3>
      <p class="settings_view_note">{{ t('stg_dark_desc') }}</p>
      <div class="theme_cards">
        <button
          class="theme_card"
          :class="{ active: theme === 'light' }"
          @click="setTheme('light')"
        >
          ☀️ {{ t('stg_theme_light') }}
        </button>
        <button
          class="theme_card"
          :class="{ active: theme === 'dark' }"
          @click="setTheme('dark')"
        >
          🌙 {{ t('stg_theme_dark') }}
        </button>
        <button
          class="theme_card"
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
    // D-15: a write failure = never a false success — UI revert + visible error
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
