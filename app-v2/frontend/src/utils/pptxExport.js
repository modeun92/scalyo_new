// Export PPTX d'un COPIL (étape 4 du chantier client-centric).
// pptxgenjs est chargé à la demande (dynamic import) pour ne pas alourdir le
// bundle. Les graphiques sont des charts PowerPoint NATIFS (modifiables par le
// client après export).
//
// Lot COPIL-RENDER-EXPORT (03/09/2026) :
//   • la LANGUE DU DECK (copil.lang) pilote nombres, guillemets, police et `lang`
//     des runs — plus aucune chaîne française en dur (t() reçu en argument) ;
//   • TOUTES les séries d'un graphique sont exportées (COPIL-SERIES-LOST) ;
//   • le bloc image est exporté, embarqué en base64 (COPIL-IMAGE-EXPORT) — un
//     média irrécupérable donne un cadre vide + légende, jamais un crash ;
//   • le KPI unique garde son titre ; valeur et unité sont séparées.
import { deckLang, deckLocaleTag, deckFont, deckNumber, deckValueUnit, deckQuote, presentableBlocks } from '@/utils/copilFormat'

// Design 3a « nuit en fond clair » : fond blanc violacé, encre nuit,
// accents violets, barre signature 4 couleurs sur chaque slide de contenu.
const BG = 'FDFCFF'
const CARD = 'FFFFFF'
const CARD_BORDER = 'F0EBFA'
const TXT = '17112B'
const MUTED = '55506B'
const FAINT = '9A94B0'
const SPECTRUM = ['FFB020', 'FF4D8D', '8B5CF6', '22B8F0']
const SERIES_FALLBACK = ['8B5CF6', 'F59E0B', '10B981', '3B82F6', 'EF4444', '06B6D4']

function addSpectrumBar(s, y = 0) {
  SPECTRUM.forEach((c, i) => {
    s.addShape('rect', { x: i * 2.5, y, w: 2.5, h: 0.055, fill: { color: c }, line: { type: 'none' } })
  })
}

function hex(c, fallback = '7C3AED') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim())
  return m ? m[1].toUpperCase() : fallback
}

// Contexte d'export : langue du deck → police, tag de langue, formateurs.
function makeCtx(copil, t) {
  const lang = deckLang(copil.lang)
  const fontFace = deckFont(lang)
  const langTag = deckLocaleTag(lang)
  return {
    lang, t,
    text: (opts = {}) => ({ fontFace, lang: langTag, ...opts }),
    num: (v) => deckNumber(v, lang),
    vu: (v, u) => deckValueUnit(v, u, lang),
    quote: (s) => deckQuote(s, lang),
  }
}

function addTitleSlide(pptx, copil, X) {
  const s = pptx.addSlide()
  s.background = { color: BG }
  addSpectrumBar(s, 0)
  addSpectrumBar(s, 5.57)
  s.addText('COPIL', X.text({ x: 0.5, y: 1.35, w: 9, h: 0.4, fontSize: 13, bold: true, color: hex(copil.color, '8B5CF6'), align: 'center', charSpacing: 6 }))
  s.addText(copil.title || 'COPIL', X.text({ x: 0.5, y: 1.85, w: 9, h: 1.2, fontSize: 42, bold: true, color: TXT, align: 'center' }))
  if (copil.clientName) s.addText(copil.clientName, X.text({ x: 0.5, y: 3.05, w: 9, h: 0.6, fontSize: 22, bold: true, color: hex(copil.color, '8B5CF6'), align: 'center' }))
  s.addText((copil.period || '') + (copil.presenter ? '  ·  ' + copil.presenter : ''), X.text({ x: 0.5, y: 3.7, w: 9, h: 0.5, fontSize: 15, color: MUTED, align: 'center' }))
  s.addText('Scalyo', X.text({ x: 0.5, y: 5.0, w: 9, h: 0.4, fontSize: 11, color: FAINT, align: 'center', charSpacing: 3 }))
}

function slideBase(pptx, title, X) {
  const s = pptx.addSlide()
  s.background = { color: BG }
  addSpectrumBar(s)
  if (title) s.addText(title, X.text({ x: 0.5, y: 0.35, w: 9, h: 0.7, fontSize: 26, bold: true, color: TXT, align: 'center' }))
  return s
}

function addChartSlide(pptx, block, kind, X) {
  const s = slideBase(pptx, block.title, X)
  const types = { bar: 'bar', line: 'line', donut: 'doughnut' }
  const labels = block.data.labels || []
  const toNum = (arr) => (arr || []).map(v => (v === null || v === undefined || v === '') ? null : Number(v))
  let data, chartColors
  if (kind === 'donut') {
    data = [{ name: block.title || X.t('copil_export_share'), labels, values: toNum(block.data.data) }]
    chartColors = (block.data.colors || []).map((c, i) => hex(c, SERIES_FALLBACK[i % SERIES_FALLBACK.length]))
  } else {
    // COPIL-SERIES-LOST : toutes les séries, chacune avec sa couleur
    const series = (block.data.datasets || []).slice(0, 6)
    data = series.map((ds, i) => ({ name: ds.label || (block.title ? block.title + ' ' + (i + 1) : String(i + 1)), labels, values: toNum(ds.data) }))
    chartColors = series.map((ds, i) => hex(ds.color, SERIES_FALLBACK[i % SERIES_FALLBACK.length]))
  }
  const multi = data.length > 1
  const opts = {
    x: 0.7, y: 1.3, w: 8.6, h: 4.0,
    chartColors,
    catAxisLabelColor: FAINT, valAxisLabelColor: FAINT, dataLabelColor: TXT,
    catAxisLabelFontFace: deckFont(X.lang), valAxisLabelFontFace: deckFont(X.lang), dataLabelFontFace: deckFont(X.lang), legendFontFace: deckFont(X.lang),
    showValue: kind !== 'donut', showLegend: kind === 'donut' || multi, legendColor: MUTED, legendPos: kind === 'donut' ? 'r' : 'b',
    chartArea: { fill: { color: BG } }, plotArea: { fill: { color: BG } },
  }
  s.addChart(types[kind], data, opts)
}

function addKpiGridSlide(pptx, block, X) {
  const s = slideBase(pptx, block.title, X)
  const kpis = (block.data.kpis || []).slice(0, 8)
  const cols = Math.min(kpis.length, 4) || 1
  const rows = Math.ceil(kpis.length / cols)
  const w = 9 / cols - 0.2, h = rows > 1 ? 1.9 : 2.4
  kpis.forEach((k, i) => {
    const x = 0.6 + (i % cols) * (w + 0.2)
    const y = 1.5 + Math.floor(i / cols) * (h + 0.25)
    const value = X.vu(k.value, k.unit)
    s.addShape('roundRect', { x, y, w, h, fill: { color: CARD }, rectRadius: 0.12, line: { color: CARD_BORDER, width: 1.25 }, shadow: { type: 'outer', color: '3C1E8C', opacity: 0.12, blur: 8, offset: 2, angle: 90 } })
    s.addText(String(k.label || '').toUpperCase(), X.text({ x, y: y + 0.15, w, h: 0.4, fontSize: 10, color: FAINT, align: 'center', charSpacing: 2 }))
    // valeur longue (KO : 1,250,000,000 ₩) : la police descend au lieu de passer sur deux lignes
    s.addText(value, X.text({ x, y: y + 0.55, w, h: 0.8, fontSize: value.length > 12 ? 20 : value.length > 9 ? 25 : 30, bold: true, color: hex(k.color, '7C3AED'), align: 'center', fit: 'shrink' }))
    if (k.target) s.addText('/ ' + X.vu(k.target, k.unit), X.text({ x, y: y + 1.3, w, h: 0.35, fontSize: 11, color: FAINT, align: 'center' }))
  })
}

function addKpiSingleSlide(pptx, block, X) {
  const s = slideBase(pptx, block.title, X)   // le titre du bloc est rendu (audit : il disparaissait)
  const d = block.data
  const value = X.vu(d.value, d.unit)
  s.addText(value, X.text({ x: 0.5, y: 1.6, w: 9, h: 1.6, fontSize: value.length > 12 ? 56 : 80, bold: true, color: hex(d.color, '7C3AED'), align: 'center', fit: 'shrink' }))
  s.addText(String(d.label || '').toUpperCase(), X.text({ x: 0.5, y: 3.3, w: 9, h: 0.6, fontSize: 15, color: MUTED, align: 'center', charSpacing: 3 }))
  if (d.target) s.addText(X.t('copil_export_target') + ' : ' + X.vu(d.target, d.unit), X.text({ x: 0.5, y: 4.0, w: 9, h: 0.5, fontSize: 13, color: FAINT, align: 'center' }))
}

function addTableSlide(pptx, block, headers, rows, X) {
  const s = slideBase(pptx, block.title, X)
  const tableRows = [
    headers.map(hd => ({ text: String(hd).toUpperCase(), options: X.text({ bold: true, color: FAINT, fill: { color: 'F5F1FF' }, fontSize: 11 }) })),
    ...rows.map(r => r.map(c => ({ text: String(c ?? ''), options: X.text({ color: TXT, fontSize: 13 }) }))),
  ]
  s.addTable(tableRows, { x: 0.6, y: 1.4, w: 8.8, border: { type: 'solid', color: CARD_BORDER, pt: 0.75 }, fill: { color: CARD }, autoPage: false })
}

function addTextSlide(pptx, block, lines, X, opts = {}) {
  const s = slideBase(pptx, block.title, X)
  s.addText(lines, X.text({ x: 0.9, y: 1.4, w: 8.2, h: 3.8, fontSize: opts.fontSize || 18, color: TXT, align: opts.align || 'left', italic: opts.italic || false, lineSpacing: 30 }))
}

// COPIL-IMAGE-EXPORT : image embarquée (data URL). Sans donnée → cadre vide + légende.
function addImageSlide(pptx, block, dataUrl, X) {
  const s = slideBase(pptx, block.title, X)
  const caption = block.data.caption || ''
  const h = caption ? 3.6 : 4.0
  if (dataUrl) {
    s.addImage({ data: dataUrl, x: 0.7, y: 1.3, w: 8.6, h, sizing: { type: 'contain', w: 8.6, h } })
  } else {
    s.addShape('roundRect', { x: 0.7, y: 1.3, w: 8.6, h, fill: { color: CARD }, rectRadius: 0.12, line: { color: CARD_BORDER, width: 1.25 } })
    s.addText(X.t('copil_export_image_missing'), X.text({ x: 0.7, y: 1.3, w: 8.6, h, fontSize: 13, color: FAINT, align: 'center', valign: 'middle' }))
  }
  if (caption) s.addText(caption, X.text({ x: 0.7, y: 1.3 + h + 0.1, w: 8.6, h: 0.4, fontSize: 12, color: MUTED, align: 'center' }))
}

// Point d'entrée. t = fonction i18n ; loadImage(block) → data URL ou null (store).
// Rend { slides, fileName, missingImages }.
export async function exportCopilPptx(copil, t, loadImage) {
  const { default: PptxGen } = await import('pptxgenjs')
  const pptx = new PptxGen()
  pptx.defineLayout({ name: 'W', width: 10, height: 5.625 })
  pptx.layout = 'W'
  const X = makeCtx(copil, t)

  addTitleSlide(pptx, copil, X)

  const blocks = presentableBlocks(copil.blocks)
  let missingImages = 0
  for (const b of blocks) {
    if (b.type === 'chart_bar') addChartSlide(pptx, b, 'bar', X)
    else if (b.type === 'chart_line') addChartSlide(pptx, b, 'line', X)
    else if (b.type === 'chart_donut') addChartSlide(pptx, b, 'donut', X)
    else if (b.type === 'kpi_grid') addKpiGridSlide(pptx, b, X)
    else if (b.type === 'kpi_single') addKpiSingleSlide(pptx, b, X)
    else if (b.type === 'table') addTableSlide(pptx, b, b.data.headers || [], b.data.rows || [], X)
    else if (b.type === 'action_plan') addTableSlide(pptx, b, [t('copil_action_what'), t('copil_action_who'), t('copil_action_when'), t('copil_action_status')], (b.data.actions || []).map(a => [a.what, a.who, a.when, t('copil_status_' + a.status)]), X)
    else if (b.type === 'checklist') addTextSlide(pptx, b, (b.data.items || []).map(it => (it.done ? '✓  ' : '○  ') + it.text).join('\n'), X)
    else if (b.type === 'timeline') addTextSlide(pptx, b, (b.data.events || []).map(ev => (ev.date ? ev.date + ' — ' : '') + ev.title + (ev.desc ? ' · ' + ev.desc : '')).join('\n'), X)
    else if (b.type === 'quote') addTextSlide(pptx, b, X.quote(b.data.text) + '\n\n' + (b.data.author || '') + (b.data.role ? ' — ' + b.data.role : ''), X, { fontSize: 22, align: 'center', italic: true })
    else if (b.type === 'text') addTextSlide(pptx, b, String(b.data.content || ''), X)
    else if (b.type === 'image') {
      const dataUrl = (b.data.path || b.data.url) && loadImage ? await loadImage(b) : null
      if (!dataUrl) missingImages++
      addImageSlide(pptx, b, dataUrl, X)
    }
  }

  const end = pptx.addSlide()
  end.background = { color: BG }
  addSpectrumBar(end, 0)
  addSpectrumBar(end, 5.57)
  end.addText(t('copil_pres_questions'), X.text({ x: 0.5, y: 2.3, w: 9, h: 1, fontSize: 40, bold: true, color: TXT, align: 'center' }))
  end.addText((copil.title || '') + (copil.period ? ' · ' + copil.period : ''), X.text({ x: 0.5, y: 3.4, w: 9, h: 0.5, fontSize: 14, color: MUTED, align: 'center' }))

  const fileName = (t('copil_export_filename') + ' — ' + (copil.clientName || copil.title || 'export') + (copil.period ? ' — ' + copil.period : '')).replace(/[/\\:*?"<>|]/g, '-') + '.pptx'
  await pptx.writeFile({ fileName })
  return { slides: blocks.length + 2, fileName, missingImages }
}
