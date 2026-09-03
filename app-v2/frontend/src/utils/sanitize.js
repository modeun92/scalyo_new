import DOMPurify from 'dompurify'

/**
 * Sanitize HTML to prevent XSS attacks
 * Use this for ANY v-html that displays user-generated or AI-generated content
 * NOT needed for static i18n translations (LandingPage.vue)
 */
// COACH-MD then LYO-MARKDOWN (29/08): formatting of AI answers, then sanitization.
// A SINGLE source shared by Coach / the onboarding demo — never duplicate it locally (R25 §3).
// LYO-MARKDOWN: the renderer only covered **bold** — the ###/####/--- and the lists
// in Lyo's answers were displayed literally. Line-by-line renderer, zero dependency:
// headings #..#### (→ h2..h4, capped at the tags allowed by sanitizeHtml), separators,
// lists - * • and 1., bold, `code`. Everything then goes through DOMPurify (unchanged).
function mdInline(s) {
  return s
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function formatAiText(text) {
  if (!text) return ''
  const out = []
  let inList = null // 'ul' | 'ol'
  const closeList = () => { if (inList) { out.push('</' + inList + '>'); inList = null } }
  for (const raw of String(text).split('\n')) {
    const t = raw.trim()
    let m
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
      closeList()
      const lvl = Math.min(m[1].length + 1, 4) // # → h2 … ###+ → h4 (h5/h6 not allowed by DOMPurify here)
      out.push('<h' + lvl + '>' + mdInline(m[2]) + '</h' + lvl + '>')
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); out.push('<hr>'); continue }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul' }
      out.push('<li>' + mdInline(m[1]) + '</li>')
      continue
    }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol' }
      out.push('<li>' + mdInline(m[1]) + '</li>')
      continue
    }
    closeList()
    out.push(t === '' ? '<br>' : mdInline(t) + '<br>')
  }
  closeList()
  return sanitizeHtml(out.join(''))
}

export function sanitizeHtml(dirty) {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false
  })
}
