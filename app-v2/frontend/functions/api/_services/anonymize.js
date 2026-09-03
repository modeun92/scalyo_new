// === SCALYO — Anonymisation avant fallback IA hors UE (DeepSeek) ===
// Maillon RGPD critique. Appliqué UNIQUEMENT quand on bascule vers DeepSeek
// (panne totale Mistral). Objectif : aucune donnée personnelle / commerciale
// identifiable ne quitte l'UE.
//
// Deux couches :
//  1. Retrait du bloc de contexte portfolio (généré par context.service.buildRichContext) :
//     noms de comptes clients, ARR, dates de renouvellement, tâches. C'est la source
//     principale de PII injectée dans les prompts.
//  2. Scrub des PII universelles (emails, montants, dates, téléphones) sur ce qui reste,
//     y compris la question tapée librement par l'utilisateur.
//
// Best-effort documenté : le déclencheur « panne totale seulement » (ai.service.js)
// minimise la fréquence d'exposition. Mistral (EU) reste le canal nominal.

// LYO-CONTEXT : ECHELLE et COMPTE CITE ajoutés — tout bloc généré par
// context.service.buildRichContext DOIT figurer ici (maillon RGPD du fallback).
const DATA_HEADER = /^(PORTFOLIO|URGENCES|RENOUVELLEMENTS|TACHES EN RETARD|COMPTE CITE|ECHELLE|CONTEXTE UTILISATEUR|CONTEXT)/i

// Retire le bloc de données portfolio structuré (en-tête + lignes "- ..." qui suivent)
function stripPortfolioBlock(text) {
  if (!text) return text
  const lines = text.split('\n')
  let inDataBlock = false
  const kept = []
  for (const line of lines) {
    const t = line.trim()
    if (DATA_HEADER.test(t)) { inDataBlock = true; continue }
    if (inDataBlock) {
      if (t === '' || t.startsWith('-') || t.startsWith('•')) continue
      inDataBlock = false
    }
    kept.push(line)
  }
  return kept.join('\n')
}

// Masque les PII universelles restantes
function scrubPII(text) {
  if (!text) return text
  return text
    // emails
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    // montants (12 000 €, 45000 EUR, 1.2M€, 50K€…)
    .replace(/\d[\d\s.,]*\s?(k€|K€|M€|k EUR|EUR|€)/gi, '[montant]')
    // dates ISO
    .replace(/\d{4}-\d{2}-\d{2}/g, '[date]')
    // numéros de téléphone (best-effort)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[num]')
}

function anonymizeText(text) {
  return scrubPII(stripPortfolioBlock(text))
}

// Entrée principale : reçoit { systemPrompt, messages }, renvoie une copie anonymisée.
export function anonymizeForFallback({ systemPrompt, messages }) {
  return {
    systemPrompt: anonymizeText(systemPrompt || ''),
    messages: (messages || []).map(m => ({
      role: m.role,
      content: anonymizeText(m.content || ''),
    })),
  }
}
