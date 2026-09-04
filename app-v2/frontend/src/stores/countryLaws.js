// COUNTRY-LAWS-I18N (04/09): nameKey / privacyKey / taxNameKey are i18n KEYS, not text.
// These three fields used to hold prose in ONE language per country - French for FR/BE/CH/CA,
// English for US, Korean for KR - and were rendered raw whatever the interface language was.
// An English user reading a quote got 'RGPD (Reglement General sur la Protection des Donnees)',
// and the KR row proved the shape could not work: name was '한국 (Coree du Sud)', Korean AND French
// in a single string, correct in neither locale. Views render them with t() (R25 s3: no t() here).
//
// Everything else in this table is language-independent on purpose: flag, ISO currency, tax rate,
// statutory hours, the national number FORMAT.
//
// STILL HARD-CODED, ON PURPOSE UNTIL DECIDED: privacyAuthority, laborLaw, legalMentions,
// dataRights and emergencyNumber below are French (or English/Korean) prose with NO i18n key.
// They are reachable from nowhere - verified: zero references outside this file - so they are
// dead data, not a visible bug. Translating them would be waste; deleting them is a call for
// the owner, not a side effect of this change. Do one or the other before rendering any of them.
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from './auth'

const LAWS = {
  FR: {
    nameKey: 'country_law_country_FR', flag: '🇫🇷', currency: 'EUR', currencySymbol: '€',
    privacyKey: 'country_law_privacy_FR',
    privacyAuthority: 'CNIL',
    laborLaw: 'Code du travail',
    hoursPerWeek: 35, hoursPerDay: 7, workDaysPerWeek: 5,
    vacationDays: 25, publicHolidays: 11,
    taxRate: 20, taxNameKey: 'country_law_tax_FR',
    legalMentions: 'Mentions légales obligatoires (SIRET, RCS, capital social)',
    legalNumberFormat: '000 000 000 00000',
    dataRights: ['Consentement explicite', "Droit à l'oubli", 'Portabilité des données', 'DPO obligatoire > 250 salariés'],
    emergencyNumber: '3114',
  },
  BE: {
    nameKey: 'country_law_country_BE', flag: '🇧🇪', currency: 'EUR', currencySymbol: '€',
    privacyKey: 'country_law_privacy_BE',
    privacyAuthority: 'APD (Autorité de protection des données)',
    laborLaw: 'Code du bien-être au travail (loi 1996)',
    hoursPerWeek: 38, hoursPerDay: 7.6, workDaysPerWeek: 5,
    vacationDays: 20, publicHolidays: 10,
    taxRate: 21, taxNameKey: 'country_law_tax_BE',
    legalMentions: 'Numéro BCE obligatoire',
    legalNumberFormat: 'BE 0000.000.000',
    dataRights: ['CCT (Conventions Collectives de Travail)', 'GDPR complet', 'DPO recommandé'],
    emergencyNumber: '0800 32 123',
  },
  CH: {
    nameKey: 'country_law_country_CH', flag: '🇨🇭', currency: 'CHF', currencySymbol: 'CHF',
    privacyKey: 'country_law_privacy_CH',
    privacyAuthority: 'PFPDT',
    laborLaw: 'Code des Obligations (CO)',
    hoursPerWeek: 42, hoursPerDay: 8.4, workDaysPerWeek: 5,
    vacationDays: 20, publicHolidays: 9,
    taxRate: 8.1, taxNameKey: 'country_law_tax_CH',
    legalMentions: 'Numéro IDE obligatoire',
    legalNumberFormat: 'CHE-000.000.000',
    dataRights: ['Conformité similaire RGPD', "Pas d'amende administrative directe", 'Responsabilité pénale individuelle'],
    emergencyNumber: '143',
  },
  CA: {
    nameKey: 'country_law_country_CA', flag: '🇨🇦', currency: 'CAD', currencySymbol: '$CA',
    privacyKey: 'country_law_privacy_CA',
    privacyAuthority: 'OPC (Québec) / Privacy Commissioner',
    laborLaw: 'Code canadien du travail',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 10, publicHolidays: 9,
    taxRate: 5, taxNameKey: 'country_law_tax_CA',
    legalMentions: "Numéro d'entreprise du Québec",
    legalNumberFormat: '000000000',
    dataRights: ['Consentement valide', 'Responsable protection vie privée', 'Loi 25 Québec: amendes significatives'],
    emergencyNumber: '1-866-APPELLE',
  },
  US: {
    nameKey: 'country_law_country_US', flag: '🇺🇸', currency: 'USD', currencySymbol: '$',
    privacyKey: 'country_law_privacy_US',
    privacyAuthority: 'FTC / State AGs',
    laborLaw: 'FLSA (Fair Labor Standards Act)',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 0, publicHolidays: 11,
    taxRate: 0, taxNameKey: 'country_law_tax_US',
    legalMentions: 'Varies by state',
    legalNumberFormat: '00-0000000',
    dataRights: ['Opt-out of data sale (CCPA)', 'No uniform federal protection', 'Rights vary by state'],
    emergencyNumber: '988',
  },
  KR: {
    nameKey: 'country_law_country_KR', flag: '🇰🇷', currency: 'KRW', currencySymbol: '₩',
    privacyKey: 'country_law_privacy_KR',
    privacyAuthority: 'PIPC 개인정보보호위원회',
    laborLaw: '근로기준법 (Labour Standards Act)',
    hoursPerWeek: 40, hoursPerDay: 8, workDaysPerWeek: 5,
    vacationDays: 15, publicHolidays: 15,
    taxRate: 10, taxNameKey: 'country_law_tax_KR',
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
