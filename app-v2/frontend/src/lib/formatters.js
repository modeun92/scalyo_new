// A-11 / MIN-C7 — CENTRAL localized formatters (decision by Lidia 18/07):
// the CURRENCY is a property of the ACCOUNT (user_profiles.currency, default EUR),
// never of the display language — only the FORMATTING (separators, symbol position)
// follows the locale. Zero conversion: the symbol does not change with the
// language. Before this module, three divergent conventions coexisted
// (KpiCard forced EUR · Dashboard ko→KRW · satisfactionHelpers en→USD/ko→KRW).
//
// i18n access pattern outside a component: i18n.global (see lib/supabaseWrite.js).
import { i18n } from '@/i18n'
import { useProfileStore } from '@/stores/profile'
import { HEALTH_MAX, toHealthNumber } from '@/lib/health'
import { DEFAULT_CURRENCY, isSupportedCurrency } from '@/config/currencies'

const LOCALE_TAGS = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }

// REGIONAL-I18N (04/09): the app locale can now carry a country ('fr-CA', 'en-GB'), and THAT is
// already a BCP-47 tag Intl understands — pass it through untouched so a Québec account gets
// `1 234,56 $` and a UK account `£1,234.56`, not the France/US default. Only a bare language is
// expanded through the table below (Intl needs a region to pick separators: 'fr' alone works, but
// 'fr-FR' is what the product has always formatted with — keeping it avoids a silent format shift
// on every existing account). An unknown value still lands on French, as before.
export function localeTag() {
  const locale = String(i18n.global.locale.value || '')
  if (locale.includes('-')) return locale
  return LOCALE_TAGS[locale] || 'fr-FR'
}

// DATE-KEY-UTC — LOCAL day key 'YYYY-MM-DD' (never toISOString().slice(0,10),
// which yields the UTC day: D-1 between 00:00 and 02:00 Paris time). A single source for
// every calendar date written by the front end (copils.date being the first consumer).
export function localDateKey(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// CURRENCY-ACCOUNT (04/09): a code is kept when the picker offers it (config/currencies) OR when
// Intl can actually format it. The old /^[A-Za-z]{3}$/ accepted "ABC", which then threw inside Intl
// on EVERY amount and fell back to euro row by row; validating ONLY against the picker list would
// have been the opposite mistake — a legacy profile row holding a real code the list does not carry
// yet (TRY, ZAR…) would have started rendering as euro. Anything else degrades once, here.
const CURRENCY_OK = new Map()
function formattableCurrency(code) {
  if (!/^[A-Z]{3}$/.test(code)) return false
  let ok = CURRENCY_OK.get(code)
  if (ok === undefined) {
    try { new Intl.NumberFormat('en-US', { style: 'currency', currency: code }); ok = true }
    catch (_) { ok = false }
    CURRENCY_OK.set(code, ok)
  }
  return ok
}

export function accountCurrency() {
  try {
    const c = useProfileStore().profile?.currency
    if (typeof c === 'string') {
      const code = c.trim().toUpperCase()
      if (isSupportedCurrency(code) || formattableCurrency(code)) return code
    }
  } catch (_) { /* store unavailable (public route / early boot) → default */ }
  return DEFAULT_CURRENCY
}

// NAV-SLOW (29/08): building an Intl.NumberFormat costs ~0.1 ms — and these formatters are
// called PER LIST ROW (1,097 clients × several formats per render, measured in pre-prod).
// Module-level cache per locale+options: same objects, same output, zero repeated construction.
// An invalid currency throws AT CONSTRUCTION → never cached, the EUR fallback behaves as before.
const NUMBER_FORMAT_CACHE = new Map()
function numberFormat(loc, opts) {
  const key = loc + '|' + JSON.stringify(opts)
  let f = NUMBER_FORMAT_CACHE.get(key)
  if (!f) { f = new Intl.NumberFormat(loc, opts); NUMBER_FORMAT_CACHE.set(key, f) }
  return f
}

// CURRENCY-FORMAT (25/08): the ONLY monetary formatter in the product. `currency` (ISO code) is
// only passed when the amount has its own currency — a quote follows the billing country —
// otherwise it is the ACCOUNT currency. `compact` = "118 k€" / "144 M€" for tight tables.
export function fmtCurrency(v, { compact = false, currency = null, decimals = 0 } = {}) {
  const n = Number(v)
  if (v == null || v === '' || Number.isNaN(n)) return '—'
  // compact: 3 significant digits, otherwise Korean (units 만/억 = 10⁴/10⁸) rounds 82,000 to "8만"
  // and 144 M to "1억" — production evidence 26/08. "1.5 k€" rather than "2 k€" in FR by the same rule.
  const opts = compact
    ? { style: 'currency', notation: 'compact', maximumSignificantDigits: 3 }
    : { style: 'currency', notation: 'standard', maximumFractionDigits: decimals }
  try {
    return numberFormat(localeTag(), { ...opts, currency: currency || accountCurrency() }).format(n)
  } catch (_) {
    // invalid currency (database or parameter) → EUR rendering, never a crash
    return numberFormat(localeTag(), { ...opts, currency: DEFAULT_CURRENCY }).format(n)
  }
}

// Symbol alone ("€", "$", "₩") for input labels like "ARR (€)" — same source as fmtCurrency.
export function currencySymbol(currency = null) {
  const code = currency || accountCurrency()
  try {
    const part = numberFormat(localeTag(), { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')
    return part ? part.value : code
  } catch (_) { return code }
}

// CURRENCY-ACCOUNT (04/09): localized currency NAME ("US Dollar" / "dollar des États-Unis" /
// "미국 달러") for the settings picker — derived from the ISO code and the display locale,
// so a new currency in config/currencies needs no i18n key. Falls back to the bare ISO code where
// Intl.DisplayNames is missing (older WebKit) — the picker then reads "USD — USD", never blank.
// Same reason as NUMBER_FORMAT_CACHE for the one-per-locale cache: the picker calls this once per currency.
const DISPLAY_NAMES_CACHE = new Map()
export function currencyLabel(code) {
  const c = String(code || '').toUpperCase()
  const loc = localeTag()
  let displayNames = DISPLAY_NAMES_CACHE.get(loc)
  if (displayNames === undefined) {
    try { displayNames = new Intl.DisplayNames([loc], { type: 'currency' }) } catch (_) { displayNames = null }
    DISPLAY_NAMES_CACHE.set(loc, displayNames)
  }
  try {
    const name = displayNames && displayNames.of(c)
    return name && name !== c ? name : c
  } catch (_) { return c }
}

// CURRENCY-ACCOUNT (04/09): display unit of a KPI_CATALOG entry. The monetary KPIs used to carry
// a hard-coded unit: '€' in the catalog, printed raw next to values fmtCurrency had already
// rendered in the account currency — "$1,200 €" on a USD account. A 'currency' KPI has no fixed
// unit any more: its symbol is the account's, everything else keeps the catalog's own unit ('%', 'h').
export function kpiUnit(meta) {
  if (!meta) return ''
  if (meta.format === 'currency') return currencySymbol()
  return meta.unit || ''
}

export function fmtNumber(v, opts = {}) {
  const n = Number(v)
  if (v == null || v === '' || Number.isNaN(n)) return '—'
  return numberFormat(localeTag(), opts).format(n)
}

// client_metrics batch (22/07): CENTRAL KPI formatter — extracted from DashboardView
// (single source, R25 §3) so it can be shared with the client record and the copil wizard.
// UNIT-SUFFIX-I18N (04/09): the day/hour suffixes were a { fr, en, ko } map right here — a
// translation table inside the formatter module. They are i18n keys now (unit_day_suffix /
// unit_hour_suffix), reached through i18n.global because this is not a component (R25 §5).

export function fmtKpiValue(v, format) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const loc = localeTag()
  if (format === 'currency') return fmtCurrency(n) // ACCOUNT currency (A-11)
  if (format === 'percentage' || format === 'percent') return numberFormat(loc, { maximumFractionDigits: 1 }).format(n) + '%'
  if (format === 'score' || format === 'decimal') return numberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
  if (format === 'ratio') return numberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + 'x'
  if (format === 'days') return String(Math.round(n)) + i18n.global.t('unit_day_suffix')
  if (format === 'hours') return numberFormat(loc, { maximumFractionDigits: 1 }).format(n) + i18n.global.t('unit_hour_suffix')
  if (format === 'number' || format === 'integer') return numberFormat(loc, { maximumFractionDigits: 0 }).format(n)
  return String(v)
}

// HEALTH-SCALE (25/08): localized health score out of 10 — "7/10", "7,5/10" (FR) / "7.5/10" (EN, KO).
// A client's score: at most 1 decimal, never "7.0". Average (average: true): always
// 1 decimal ("7,0/10"), same convention as the Dashboard KPI tile (fmtKpiValue 'score').
// Missing → "—". The "/10" suffix is the canonical scale (lib/health.HEALTH_MAX).
export function fmtHealth(v, { suffix = true, average = false } = {}) {
  const n = toHealthNumber(v)
  if (n === null) return '—'
  const num = numberFormat(localeTag(), { minimumFractionDigits: average ? 1 : 0, maximumFractionDigits: 1 }).format(n)
  return suffix ? `${num}/${HEALTH_MAX}` : num
}

// 'YYYY-MM-01' → short localized month label ("juil. 2026" / “Jul 2026” / "2026년 7월")
export function fmtMonth(period) {
  if (!period) return '—'
  const date = new Date(String(period).slice(0, 10))
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(localeTag(), { month: 'short', year: 'numeric' })
}

export function fmtDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(localeTag(), opts)
}

export function fmtTime(d, opts = { hour: '2-digit', minute: '2-digit' }) {
  const date = d ? new Date(d) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(localeTag(), opts)
}
