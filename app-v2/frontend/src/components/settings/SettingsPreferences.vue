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

    <!-- Currency — CURRENCY-ACCOUNT (04/09): the account currency was in the database but on no
         screen, so everything rendered in euro whatever the account billed in (error_list §5). -->
    <div class="settings_view_section">
      <h3>💱 {{ t('stg_currency_title') }}</h3>
      <p class="settings_view_note">{{ t('stg_currency_desc') }}</p>
      <div class="settings_currency_row">
        <select
          class="settings_currency_select"
          :value="selectedCurrency"
          :disabled="currencySaving"
          @change="changeCurrency($event)"
        >
          <option v-for="code in currencyOptions" :key="code" :value="code">
            {{ code }} — {{ currencyLabel(code) }}
          </option>
        </select>
        <span class="settings_currency_sample">{{ currencySample }}</span>
      </div>
      <p class="settings_view_note settings_currency_warning">⚠️ {{ t('stg_currency_no_conversion') }}</p>
      <p v-if="currencySaved" class="settings_saved">✓ {{ t('stg_currency_saved') }}</p>
      <p v-if="currencyError" class="settings_view_field_error">{{ t('stg_currency_error') }}</p>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { SUPPORTED_CURRENCIES } from '@/config/currencies'
import { currencyLabel, fmtCurrency } from '@/lib/formatters'

const { t, locale } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const profileStore = useProfileStore()

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

/* ── Currency ───────────────────────────── */
// Read straight from the store: after a successful write the whole app re-renders in the new
// currency — every fmtCurrency() call reads the same profile.
const selectedCurrency = computed(() => profileStore.currency)
// A stored code the picker does not list (legacy row) is shown rather than silently swapped for
// EUR — the amounts on screen are in THAT currency. It can be left, not re-selected.
const currencyOptions = computed(() => SUPPORTED_CURRENCIES.includes(selectedCurrency.value)
  ? SUPPORTED_CURRENCIES
  : [selectedCurrency.value, ...SUPPORTED_CURRENCIES])
const currencySample = computed(() => fmtCurrency(1234567, { compact: true }))
// AppLayout loads the profile on mount; this guard covers a direct hit on /app/settings
// where the store may not be populated yet — without it the picker shows EUR for a KRW account.
if (!profileStore.profile) profileStore.load()

const currencySaving = ref(false)
const currencySaved = ref(false)
const currencyError = ref(false)

async function changeCurrency(event) {
  const el = event.target
  const code = el.value
  const prev = selectedCurrency.value
  if (code === prev) return
  currencySaving.value = true
  currencyError.value = false
  const res = await profileStore.setCurrency(code)
  currencySaving.value = false
  if (res && res.success) {
    currencySaved.value = true
    setTimeout(() => { currencySaved.value = false }, 2000)
  } else {
    // D-15: no false ✓. The revert is written on the DOM node ON PURPOSE: :value is bound to an
    // unchanged computed, so Vue patches nothing and the <select> would keep showing the currency
    // the account is NOT in — a silent lie about what the amounts around it mean.
    el.value = prev
    currencyError.value = true
    setTimeout(() => { currencyError.value = false }, 4000)
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
