/**
 * Email Studio — Templates data & category helpers
 */

export const EMAIL_FREE_QUOTA = 3000
export const EMAIL_OVERAGE_RATE = 1.5 // €/1000 beyond the quota

export const templates = [
  { id: 1, nameKey: 'es_tpl1_name', categoryKey: 'onboarding', type: 'csm', subjectKey: 'es_tpl1_subject', bodyKey: 'es_tpl1_body' },
  { id: 2, nameKey: 'es_tpl2_name', categoryKey: 'qbr', type: 'csm', subjectKey: 'es_tpl2_subject', bodyKey: 'es_tpl2_body' },
  { id: 3, nameKey: 'es_tpl3_name', categoryKey: 'suivi', type: 'csm', subjectKey: 'es_tpl3_subject', bodyKey: 'es_tpl3_body' },
  { id: 4, nameKey: 'es_tpl4_name', categoryKey: 'risque', type: 'csm', subjectKey: 'es_tpl4_subject', bodyKey: 'es_tpl4_body' },
  { id: 5, nameKey: 'es_tpl5_name', categoryKey: 'renouvellement', type: 'csm', subjectKey: 'es_tpl5_subject', bodyKey: 'es_tpl5_body' },
  { id: 6, nameKey: 'es_tpl6_name', categoryKey: 'expansion', type: 'csm', subjectKey: 'es_tpl6_subject', bodyKey: 'es_tpl6_body' },
  { id: 7, nameKey: 'es_tpl7_name', categoryKey: 'nps', type: 'csm', subjectKey: 'es_tpl7_subject', bodyKey: 'es_tpl7_body' },
  { id: 8, nameKey: 'es_tpl8_name', categoryKey: 'prospection', type: 'commercial', subjectKey: 'es_tpl8_subject', bodyKey: 'es_tpl8_body' },
  { id: 9, nameKey: 'es_tpl9_name', categoryKey: 'negociation', type: 'commercial', subjectKey: 'es_tpl9_subject', bodyKey: 'es_tpl9_body' },
  { id: 10, nameKey: 'es_tpl10_name', categoryKey: 'relance', type: 'commercial', subjectKey: 'es_tpl10_subject', bodyKey: 'es_tpl10_body' },
  { id: 11, nameKey: 'es_tpl11_name', categoryKey: 'retention', type: 'kam', subjectKey: 'es_tpl11_subject', bodyKey: 'es_tpl11_body' },
  { id: 12, nameKey: 'es_tpl12_name', categoryKey: 'closing', type: 'commercial', subjectKey: 'es_tpl12_subject', bodyKey: 'es_tpl12_body' },
]

const catClassMap = {
  onboarding: 'cat-blue',
  qbr: 'cat-purple',
  suivi: 'cat-teal',
  risque: 'cat-red',
  renouvellement: 'cat-amber',
  expansion: 'cat-green',
  nps: 'cat-pink',
  prospection: 'cat-indigo',
  negociation: 'cat-orange',
  relance: 'cat-slate',
  closing: 'cat-dark',
  retention: 'cat-red',
  all: 'cat-gray'
}

export function catClass(key) {
  return catClassMap[key] || 'cat-gray'
}

// EMAIL-NEWLINES (29/08): the bodies of the default templates are HTML
// (fr/en/ko-content.js — <p>, <ul><li>, <br/>). The old `<[^>]*>` strip removed
// the tags WITHOUT converting them to line breaks → textarea, copy and email
// came out as one glued block ("steps:Kick-off session (30 min)Setup…").
// Structural conversion BEFORE the strip — a SINGLE source (R25 §3), shared by
// EmailStudioView and EmailPreview.
export function htmlToPlainText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
