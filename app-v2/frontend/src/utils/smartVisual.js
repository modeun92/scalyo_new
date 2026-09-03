// Intuitive generation of COPIL visuals (step 3 of the client-centric workstream).
// The CSM enters a metric (name, values); we propose the RIGHT block, pre-filled,
// which they remain free to change. Pure function → testable under node.

const TEMPORAL_RE = /^(jan|f[ée]v|mar|avr|apr|mai|may|juin|jun|juil|jul|ao[uû]|aug|sep|oct|nov|d[ée]c|q[1-4]|s[12]\b|[0-9]{4}|[0-9]{1,2}[/\-][0-9]{1,4}|w[0-9]{1,2})/i

const PALETTE = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

export function isTemporalLabels(labels) {
  const filled = labels.filter(l => String(l || '').trim() !== '')
  if (filled.length < 2) return false
  const hits = filled.filter(l => TEMPORAL_RE.test(String(l).trim()))
  return hits.length >= Math.ceil(filled.length * 0.6)
}

// rows: [{ label, value }] (numeric value); opts: { unit, target, hint }
// hint: 'auto' | 'kpi' | 'line' | 'bar' | 'donut' | 'table'
// Returns { type, data } ready for a copil block, or null if invalid.
export function suggestBlock(name, rows, opts = {}) {
  const unit = opts.unit || ''
  const target = opts.target === '' || opts.target == null ? null : Number(opts.target)
  const hint = opts.hint || 'auto'
  const clean = (rows || [])
    .map(r => ({ label: String(r.label || '').trim(), value: Number(r.value) }))
    .filter(r => !Number.isNaN(r.value) && (r.label !== '' || rows.length === 1))
  if (!name || !clean.length) return null

  const labels = clean.map(r => r.label)
  const values = clean.map(r => r.value)
  const sum = values.reduce((a, b) => a + b, 0)

  let type = hint
  if (hint === 'auto') {
    if (clean.length === 1) type = 'kpi'
    else if (isTemporalLabels(labels)) type = 'line'
    else if (clean.length <= 6 && unit === '%' && sum >= 95 && sum <= 105) type = 'donut'
    else if (clean.length <= 8) type = 'bar'
    else type = 'table'
  }

  if (type === 'kpi') {
    const d = { label: name, value: values[0], unit, trend: 'up', previous: '', color: PALETTE[0] }
    if (target != null) d.target = target
    return { type: 'kpi_single', data: d }
  }
  if (type === 'line' || type === 'bar') {
    return { type: type === 'line' ? 'chart_line' : 'chart_bar', data: { labels, datasets: [{ label: name + (unit ? ' (' + unit + ')' : ''), data: values, color: PALETTE[0] }] } }
  }
  if (type === 'donut') {
    return { type: 'chart_donut', data: { labels, data: values, colors: labels.map((_, i) => PALETTE[i % PALETTE.length]) } }
  }
  return { type: 'table', data: { headers: ['', name + (unit ? ' (' + unit + ')' : '')], rows: clean.map(r => [r.label, String(r.value)]) } }
}

// Builds the complete block, insertable into copils.blocks
export function buildMetricBlock(name, rows, opts = {}) {
  const s = suggestBlock(name, rows, opts)
  if (!s) return null
  return { id: uid(), type: s.type, title: name, data: s.data, visible: true, width: 'full' }
}
