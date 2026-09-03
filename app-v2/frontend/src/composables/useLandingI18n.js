import { ref } from 'vue'
import { L } from '@/i18n/landing'

const locale = ref('fr')

const langs = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'kr', label: '한국어' },
]

export function useLandingI18n() {
  function t(key) {
    return (L[locale.value] || L.fr)[key] || L.fr[key] || key
  }
  return { t, locale, langs }
}
