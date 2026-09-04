// COPIL — the SINGLE source for a deck's localized rendering (presentation + PPTX export).
// The DECK language (copils.lang, chosen on the cover) drives: number
// separators, quotation marks, font and the PowerPoint lang attribute. It is distinct
// from the interface language (i18n): a French-speaking CSM may prepare a Korean
// COPIL. Pure functions, no Vue dependency → testable under node.

export const DECK_LANGS = ['fr', 'en', 'ko']

const LOCALE_TAGS = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }
// PowerPoint font per language: Calibri otherwise; in Korean, Malgun Gothic (Windows,
// replaced by Apple SD Gothic Neo on Mac by PowerPoint itself) — without a declared
// East Asian font, Hangul falls back to the theme default (audit 03/09).
const FONTS = { fr: 'Calibri', en: 'Calibri', ko: 'Malgun Gothic' }
const QUOTES = { fr: ['« ', ' »'], en: ['“', '”'], ko: ['“', '”'] }

// REGIONAL-I18N (04/09): the region is STRIPPED, never matched. The deck language is one of
// DECK_LANGS, and the app locale that seeds it now carries a country ('en-GB'): the old exact
// `includes(lang)` sent an English deck to the French branch — French separators and « » quotes
// on an English deck, silently, because 'en-GB' is not literally 'en'.
export function deckLang(lang) {
  const base = String(lang || '').split(/[-_]/)[0]
  return DECK_LANGS.includes(base) ? base : 'fr'
}
export function deckLocaleTag(lang) {
  return LOCALE_TAGS[deckLang(lang)]
}
export function deckFont(lang) {
  return FONTS[deckLang(lang)]
}
export function deckQuote(text, lang) {
  const [o, c] = QUOTES[deckLang(lang)]
  return o + (text || '') + c
}

// Localized number. A non-numeric value (text entered as-is) is rendered
// as-is; empty → "—". Never an invented M/K suffix: the CSM chooses their
// unit (k€, M€…) in the label.
export function parseDeckNumber(v) {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  let s = String(v).trim().replace(/[\s\u00a0\u202f']/g, '')
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) {
    // both present: the last separator is the decimal one (1.250,5 or 1,250.5)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (commas === 1 && /,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')               // 3,2 → decimal point
  } else if (commas) {
    s = s.replace(/,/g, '')                // 1,250,000 → milliers
  } else if (dots > 1) {
    s = s.replace(/\./g, '')               // 1.250.000 → milliers
  }
  return Number(s)
}

export function deckNumber(v, lang, opts = {}) {
  if (v == null || v === '') return '—'
  const n = parseDeckNumber(v)
  if (Number.isNaN(n)) return String(v)
  return new Intl.NumberFormat(deckLocaleTag(lang), { maximumFractionDigits: 2, ...opts }).format(n)
}

// Value + unit: narrow non-breaking space before a symbol (€, %, ₩…), nothing before
// an alphabetic unit already spaced by the CSM.
export function deckValueUnit(v, unit, lang) {
  const val = deckNumber(v, lang)
  const u = (unit || '').trim()
  if (!u) return val
  return val + ' ' + u
}

// A chart without a single entered value (empty seeds, D2①) is neither presented nor exported.
export function chartHasData(block) {
  const d = block?.data || {}
  const vals = block.type === 'chart_donut' ? (d.data || []) : (d.datasets || []).flatMap(s => s.data || [])
  return vals.some(v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
}

// Blocks rendered in the presentation and exported: visible, neither a separator nor a dead type,
// and for a chart: at least one value.
export function presentableBlocks(blocks) {
  return (blocks || []).filter(b => b.visible !== false && b.type !== 'divider' && b.type !== 'kpi_tracker'
    && (!b.type.startsWith('chart_') || chartHasData(b)))
}
