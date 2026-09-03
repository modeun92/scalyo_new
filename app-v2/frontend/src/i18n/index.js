import { createI18n } from 'vue-i18n'
import fr from './fr'
import frContent from './fr-content'
import en from './en'
import enContent from './en-content'
import ko from './ko'
import koContent from './ko-content'

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('scalyo_locale') || 'fr',
  fallbackLocale: 'fr',
  messages: {
    fr: { ...fr, ...frContent },
    en: { ...en, ...enContent },
    ko: { ...ko, ...koContent },
  },
})
