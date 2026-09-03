import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from './auth'

const LAWS = {
  FR: {
    name: 'France', flag: '🇫🇷', currency: 'EUR', currencySymbol: '€',
    privacy: 'RGPD (Règlement Général sur la Protection des Données)',
    privacyAuthority: 'CNIL',
    laborLaw: 'Code du travail',
    hoursPerWeek: 35, hoursPerDay: 7, workDaysPerWeek: 5,
    vacationDays: 25, publicHolidays: 11,
    taxRate: 20, taxName: 'TVA',
    legalMentions: 'Mentions légales obligatoires (SIRET, RCS, capital social)',
    legalNumberFormat: '000 000 000 00000',
    dataRights: ['Consentement explicite', "Droit à l'oubli", 'Portabilité des données', 'DPO obligatoire > 250 salariés'],
    emergencyNumber: '3114',
  },
  BE: {
    name: 'Belgique', flag: '🇧🇪', currency: 'EUR', currencySymbol: '€',
    privacy: 'GDPR (General Data Protection Regulation)',
    privacyAuthority: 'APD (Autorité de protection des données)',
    laborLaw: 'Code du bien-être au travail (loi 1996)',
    hoursPerWeek: 38, hoursPerDay: 7.6, workDaysPerWeek: 5,
    vacationDays: 20, publicHolidays: 10,
    taxRate: 21, taxName: 'TVA',
    legalMentions: 'Numéro BCE obligatoire',
    legalNumberFormat: 'BE 0000.000.000',
    dataRights: ['CCT (Conventions Collectives de Travail)', 'GDPR complet', 'DPO recommandé'],
    emergencyNumber: '0800 32 123',
  },
  CH: {
    name: 'Suisse', flag: '🇨🇭', currency: 'CHF', currencySymbol: 'CHF',
    privacy: 'nLPD 2023 (nouvelle Loi sur la Protection des Données)',
    privacyAuthority: 'PFPDT',
    laborLaw: 'Code des Obligations (CO)',
    hoursPerWeek: 42, hoursPerDay: 8.4, workDaysPerWeek: 5,
    vacationDays: 20, publicHolidays: 9,
    taxRate: 8.1, taxName: 'TVA',
    legalMentions: 'Numéro IDE obligatoire',
    legalNumberFormat: 'CHE-000.000.000',
    dataRights: ['Conformité similaire RGPD', "Pas d'amende administrative directe", 'Responsabilité pénale individuelle'],
    emergencyNumber: '143',
  },
  CA: {
    name: 'Canada', flag: '🇨🇦', currency: 'CAD', currencySymbol: '$CA',
    privacy: 'PIPEDA (fédéral) + Loi 25 (Québec)',
    privacyAuthority: 'OPC (Québec) / Privacy Commissioner',
    laborLaw: 'Code canadien du travail',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 10, publicHolidays: 9,
    taxRate: 5, taxName: 'TPS',
    legalMentions: "Numéro d'entreprise du Québec",
    legalNumberFormat: '000000000',
    dataRights: ['Consentement valide', 'Responsable protection vie privée', 'Loi 25 Québec: amendes significatives'],
    emergencyNumber: '1-866-APPELLE',
  },
  US: {
    name: 'USA', flag: '🇺🇸', currency: 'USD', currencySymbol: '$',
    privacy: 'CCPA/CPRA (California) — no uniform federal law',
    privacyAuthority: 'FTC / State AGs',
    laborLaw: 'FLSA (Fair Labor Standards Act)',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 0, publicHolidays: 11,
    taxRate: 0, taxName: 'Sales Tax (varies by state)',
    legalMentions: 'Varies by state',
    legalNumberFormat: '00-0000000',
    dataRights: ['Opt-out of data sale (CCPA)', 'No uniform federal protection', 'Rights vary by state'],
    emergencyNumber: '988',
  },
  KR: {
    name: '한국 (Corée du Sud)', flag: '🇰🇷', currency: 'KRW', currencySymbol: '₩',
    privacy: 'PIPA 개인정보보호법 (Personal Information Protection Act)',
    privacyAuthority: 'PIPC 개인정보보호위원회',
    laborLaw: '근로기준법 (Labour Standards Act)',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 15, publicHolidays: 15,
    taxRate: 10, taxName: 'VAT 부가가치세',
    legalMentions: '사업자등록번호 필수',
    legalNumberFormat: '000-00-00000',
    dataRights: ['주 52시간 최대 (40h + 12h 초과근무)', '명시적 동의 필수', '매출의 최대 3% 벌금'],
    emergencyNumber: '1393',
  },
}

export const useCountryLawStore = defineStore('countryLaws', () => {
  const auth = useAuthStore()

  const currentCountry = computed(() => auth.company?.country || 'FR')
  const laws = computed(() => LAWS[currentCountry.value] || LAWS.FR)
  const allCountries = Object.entries(LAWS).map(([code, data]) => ({ code, ...data }))

  function getLaws(countryCode) {
    return LAWS[countryCode] || LAWS.FR
  }

  return { currentCountry, laws, allCountries, getLaws, LAWS }
})
