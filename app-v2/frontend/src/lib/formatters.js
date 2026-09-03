// A-11 / MIN-C7 — Formateurs localisés CENTRAUX (arbitrage Lidia 18/07) :
// la DEVISE est une propriété du COMPTE (user_profiles.currency, défaut EUR),
// jamais de la langue d'affichage — seul le FORMATAGE (séparateurs, position du
// symbole) suit la locale. Zéro conversion : le symbole ne change pas avec la
// langue. Avant ce module, trois conventions divergentes coexistaient
// (KpiCard EUR forcé · Dashboard ko→KRW · satisfactionHelpers en→USD/ko→KRW).
//
// Pattern d'accès i18n hors composant : i18n.global (cf. lib/supabaseWrite.js).
import { i18n } from '@/i18n'
import { useProfileStore } from '@/stores/profile'
import { HEALTH_MAX, toHealthNumber } from '@/lib/health'

const LOCALE_TAGS = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }

export function localeTag() {
  return LOCALE_TAGS[i18n.global.locale.value] || 'fr-FR'
}

// DATE-KEY-UTC — clé de jour LOCALE 'YYYY-MM-DD' (jamais toISOString().slice(0,10),
// qui rend le jour UTC : J-1 entre 00:00 et 02:00 Paris). Une seule source pour
// toute date calendaire écrite par le front (copils.date en premier consommateur).
export function localDateKey(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function accountCurrency() {
  try {
    const c = useProfileStore().profile?.currency
    if (typeof c === 'string' && /^[A-Za-z]{3}$/.test(c.trim())) return c.trim().toUpperCase()
  } catch (_) { /* store indisponible (route publique / boot précoce) → défaut */ }
  return 'EUR'
}

// NAV-SLOW (29/08) : construire un Intl.NumberFormat coûte ~0,1 ms — et ces formateurs sont
// appelés PAR LIGNE de liste (1 097 clients × plusieurs formats par rendu constatés en préprod).
// Cache module par locale+options : mêmes objets, même rendu, zéro construction répétée.
// Une devise invalide jette À LA CONSTRUCTION → jamais mise en cache, le fallback EUR joue comme avant.
const NF_CACHE = new Map()
function numberFormat(loc, opts) {
  const key = loc + '|' + JSON.stringify(opts)
  let f = NF_CACHE.get(key)
  if (!f) { f = new Intl.NumberFormat(loc, opts); NF_CACHE.set(key, f) }
  return f
}

// CURRENCY-FORMAT (25/08) : SEUL formateur monétaire du produit. `currency` (code ISO) ne se
// passe que lorsque le montant a sa propre devise — un devis suit le pays de facturation —
// sinon c'est la devise du COMPTE. `compact` = « 118 k€ » / « 144 M€ » pour les tableaux serrés.
export function fmtCurrency(v, { compact = false, currency = null, decimals = 0 } = {}) {
  const n = Number(v)
  if (v == null || v === '' || Number.isNaN(n)) return '—'
  // compact : 3 chiffres significatifs, sinon le coréen (unités 만/억 = 10⁴/10⁸) arrondit 82 000 en « 8만 »
  // et 144 M en « 1억 » — preuve prod 26/08. « 1,5 k € » plutôt que « 2 k € » en FR par la même règle.
  const opts = compact
    ? { style: 'currency', notation: 'compact', maximumSignificantDigits: 3 }
    : { style: 'currency', notation: 'standard', maximumFractionDigits: decimals }
  try {
    return numberFormat(localeTag(), { ...opts, currency: currency || accountCurrency() }).format(n)
  } catch (_) {
    // devise invalide (base ou paramètre) → rendu EUR, jamais de crash
    return numberFormat(localeTag(), { ...opts, currency: 'EUR' }).format(n)
  }
}

// Symbole seul (« € », « $ », « ₩ ») pour les libellés de saisie « ARR (€) » — même source que fmtCurrency.
export function currencySymbol(currency = null) {
  const code = currency || accountCurrency()
  try {
    const part = numberFormat(localeTag(), { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')
    return part ? part.value : code
  } catch (_) { return code }
}

export function fmtNumber(v, opts = {}) {
  const n = Number(v)
  if (v == null || v === '' || Number.isNaN(n)) return '—'
  return numberFormat(localeTag(), opts).format(n)
}

// Lot client_metrics (22/07) : formateur KPI CENTRAL — extrait de DashboardView
// (source unique, R25 §3) pour être partagé avec la fiche client et le wizard copil.
// Suffixes jours/heures localisés sans clé i18n (même famille que LOCALE_TAGS).
const DAY_SUFFIX = { fr: 'j', en: 'd', ko: '일' }
const HOUR_SUFFIX = { fr: 'h', en: 'h', ko: '시간' }

export function fmtKpiValue(v, format) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const loc = localeTag()
  const lang = i18n.global.locale.value
  if (format === 'currency') return fmtCurrency(n) // devise du COMPTE (A-11)
  if (format === 'percentage' || format === 'percent') return numberFormat(loc, { maximumFractionDigits: 1 }).format(n) + '%'
  if (format === 'score' || format === 'decimal') return numberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
  if (format === 'ratio') return numberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + 'x'
  if (format === 'days') return String(Math.round(n)) + (DAY_SUFFIX[lang] || 'j')
  if (format === 'hours') return numberFormat(loc, { maximumFractionDigits: 1 }).format(n) + (HOUR_SUFFIX[lang] || 'h')
  if (format === 'number' || format === 'integer') return numberFormat(loc, { maximumFractionDigits: 0 }).format(n)
  return String(v)
}

// HEALTH-SCALE (25/08) : health score /10 localisé — « 7/10 », « 7,5/10 » (FR) / « 7.5/10 » (EN, KO).
// Score d'un client : au plus 1 décimale, jamais de « 7.0 ». Moyenne (average: true) : toujours
// 1 décimale (« 7,0/10 »), même convention que la tuile KPI du Dashboard (fmtKpiValue 'score').
// Absent → « — ». Le suffixe « /10 » est l'échelle canonique (lib/health.HEALTH_MAX).
export function fmtHealth(v, { suffix = true, average = false } = {}) {
  const n = toHealthNumber(v)
  if (n === null) return '—'
  const num = numberFormat(localeTag(), { minimumFractionDigits: average ? 1 : 0, maximumFractionDigits: 1 }).format(n)
  return suffix ? `${num}/${HEALTH_MAX}` : num
}

// 'YYYY-MM-01' → libellé mensuel localisé court (« juil. 2026 » / “Jul 2026” / « 2026년 7월 »)
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
