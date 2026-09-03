// COPIL — source UNIQUE du rendu localisé d'un deck (présentation + export PPTX).
// La langue du DECK (copils.lang, choisie en couverture) pilote : séparateurs de
// nombres, guillemets, police et attribut lang du PowerPoint. Elle est distincte
// de la langue de l'interface (i18n) : un CSM francophone peut préparer un COPIL
// coréen. Fonctions pures, sans dépendance Vue → testables sous node.

export const DECK_LANGS = ['fr', 'en', 'ko']

const LOCALE_TAGS = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }
// Police PowerPoint par langue : Calibri sinon ; en coréen, Malgun Gothic (Windows,
// remplacée par Apple SD Gothic Neo sur Mac par PowerPoint lui-même) — sans police
// est-asiatique déclarée, le hangul tombe sur le repli du thème (audit 03/09).
const FONTS = { fr: 'Calibri', en: 'Calibri', ko: 'Malgun Gothic' }
const QUOTES = { fr: ['« ', ' »'], en: ['“', '”'], ko: ['“', '”'] }

export function deckLang(lang) {
  return DECK_LANGS.includes(lang) ? lang : 'fr'
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

// Nombre localisé. Une valeur non numérique (texte saisi tel quel) est rendue
// telle quelle ; vide → « — ». Jamais de suffixe M/K inventé : le CSM choisit son
// unité (k€, M€…) dans le libellé.
export function parseDeckNumber(v) {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  let s = String(v).trim().replace(/[\s\u00a0\u202f']/g, '')
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) {
    // les deux présents : le dernier séparateur est la décimale (1.250,5 ou 1,250.5)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (commas === 1 && /,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.')               // 3,2 → décimale
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

// Valeur + unité : espace fine insécable avant un symbole (€, %, ₩…), rien avant
// une unité alphabétique déjà espacée par le CSM.
export function deckValueUnit(v, unit, lang) {
  const val = deckNumber(v, lang)
  const u = (unit || '').trim()
  if (!u) return val
  return val + ' ' + u
}

// Un graphique sans aucune valeur saisie (seeds vides, D2①) n'est ni présenté ni exporté.
export function chartHasData(block) {
  const d = block?.data || {}
  const vals = block.type === 'chart_donut' ? (d.data || []) : (d.datasets || []).flatMap(s => s.data || [])
  return vals.some(v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
}

// Blocs rendus en présentation et exportés : visibles, ni séparateur ni type mort,
// et pour un graphique : au moins une valeur.
export function presentableBlocks(blocks) {
  return (blocks || []).filter(b => b.visible !== false && b.type !== 'divider' && b.type !== 'kpi_tracker'
    && (!b.type.startsWith('chart_') || chartHasData(b)))
}
