import { createI18n } from 'vue-i18n'
import fr from './fr'
import frContent from './fr-content'
import en from './en'
import enContent from './en-content'
import ko from './ko'
import koContent from './ko-content'
import { regionalMessages, regionalFallback, resolveLocale, baseLanguage, regionOf } from './regional'

// REGIONAL-I18N (04/09): the app locale is a LANGUAGE + a COUNTRY, resolved to a single locale id
// by resolveLocale() — 'fr' + 'CA' → 'fr-CA', 'fr' + 'FR' → 'fr'. The regional packs are registered
// as their own locales next to fr / en / ko, each falling back to its base language, so EVERY
// existing t() call picks up a regional wording with no change at the call site: vue-i18n resolves
// 'fr-CA' → 'fr' key by key on its own.
//
// Two localStorage keys, not one: `scalyo_locale` keeps holding the BASE language exactly as before
// (the public pages, the DPA and the landing read it and know nothing about regions), and
// `scalyo_region` holds the country. Writing 'fr-CA' into `scalyo_locale` would have made every one
// of those readers fall through to French for a UK account.
const storedLang = (() => { try { return localStorage.getItem('scalyo_locale') } catch (_) { return null } })()
const storedRegion = (() => { try { return localStorage.getItem('scalyo_region') } catch (_) { return null } })()

export const i18n = createI18n({
  legacy: false,
  locale: resolveLocale(storedLang || 'fr', storedRegion),
  // A regional locale falls back to its language, then to French; a bare language keeps the
  // French fallback it always had.
  fallbackLocale: { ...regionalFallback(), default: ['fr'] },
  messages: {
    fr: { ...fr, ...frContent },
    en: { ...en, ...enContent },
    ko: { ...ko, ...koContent },
    ...regionalMessages(),
  },
})

// The single writer of the app locale. Callers pass a language and a country — never a locale id —
// so the resolution rule (and the "unknown country degrades to the base language" behaviour) lives
// in exactly one place. Returns the resolved id for the caller that needs to echo it.
export function setAppLocale(lang, country) {
  const resolved = resolveLocale(lang, country)
  i18n.global.locale.value = resolved
  return resolved
}

// The requested language-code + country-code translator, for code that must render a string in a
// locale OTHER than the one on screen (a notification composed for another member, a preview).
// Inside a component, prefer the plain t() from useI18n(): the active locale is already regional.
// Outside a component, this is the i18n.global path R25 §5 mandates — never useI18n().
export function tr(key, lang, country, params = undefined) {
  return i18n.global.t(key, params || {}, { locale: resolveLocale(lang, country) })
}

// Re-exported so nothing has to know whether a helper lives in ./regional: one import path for the
// whole language+country concern.
export { resolveLocale, baseLanguage, regionOf }
