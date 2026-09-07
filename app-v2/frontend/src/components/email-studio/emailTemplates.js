/**
 * Email Studio — Templates data & category helpers
 */

export const EMAIL_FREE_QUOTA = 3000
export const EMAIL_OVERAGE_RATE = 1.5 // €/1000 beyond the quota

export const templates = [
  { id: 1, nameKey: 'email_studio_tpl1_name', categoryKey: 'onboarding', type: 'csm', subjectKey: 'email_studio_tpl1_subject', bodyKey: 'email_studio_tpl1_body' },
  { id: 2, nameKey: 'email_studio_tpl2_name', categoryKey: 'qbr', type: 'csm', subjectKey: 'email_studio_tpl2_subject', bodyKey: 'email_studio_tpl2_body' },
  { id: 3, nameKey: 'email_studio_tpl3_name', categoryKey: 'suivi', type: 'csm', subjectKey: 'email_studio_tpl3_subject', bodyKey: 'email_studio_tpl3_body' },
  { id: 4, nameKey: 'email_studio_tpl4_name', categoryKey: 'risque', type: 'csm', subjectKey: 'email_studio_tpl4_subject', bodyKey: 'email_studio_tpl4_body' },
  { id: 5, nameKey: 'email_studio_tpl5_name', categoryKey: 'renouvellement', type: 'csm', subjectKey: 'email_studio_tpl5_subject', bodyKey: 'email_studio_tpl5_body' },
  { id: 6, nameKey: 'email_studio_tpl6_name', categoryKey: 'expansion', type: 'csm', subjectKey: 'email_studio_tpl6_subject', bodyKey: 'email_studio_tpl6_body' },
  { id: 7, nameKey: 'email_studio_tpl7_name', categoryKey: 'nps', type: 'csm', subjectKey: 'email_studio_tpl7_subject', bodyKey: 'email_studio_tpl7_body' },
  { id: 8, nameKey: 'email_studio_tpl8_name', categoryKey: 'prospection', type: 'commercial', subjectKey: 'email_studio_tpl8_subject', bodyKey: 'email_studio_tpl8_body' },
  { id: 9, nameKey: 'email_studio_tpl9_name', categoryKey: 'negociation', type: 'commercial', subjectKey: 'email_studio_tpl9_subject', bodyKey: 'email_studio_tpl9_body' },
  { id: 10, nameKey: 'email_studio_tpl10_name', categoryKey: 'relance', type: 'commercial', subjectKey: 'email_studio_tpl10_subject', bodyKey: 'email_studio_tpl10_body' },
  { id: 11, nameKey: 'email_studio_tpl11_name', categoryKey: 'retention', type: 'kam', subjectKey: 'email_studio_tpl11_subject', bodyKey: 'email_studio_tpl11_body' },
  { id: 12, nameKey: 'email_studio_tpl12_name', categoryKey: 'closing', type: 'commercial', subjectKey: 'email_studio_tpl12_subject', bodyKey: 'email_studio_tpl12_body' },
]

const catClassMap = {
  onboarding: 'category_blue',
  qbr: 'category_purple',
  suivi: 'category_teal',
  risque: 'category_red',
  renouvellement: 'category_amber',
  expansion: 'category_green',
  nps: 'category_pink',
  prospection: 'category_indigo',
  negociation: 'category_orange',
  relance: 'category_slate',
  closing: 'category_dark',
  retention: 'category_red',
  all: 'category_gray'
}

export function catClass(key) {
  return catClassMap[key] || 'category_gray'
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
