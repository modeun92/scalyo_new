/**
 * Quotes — PDF generation helper
 */
import { jsPDF } from 'jspdf'
import { localeTag } from '@/lib/formatters'

// QUOTE-VAT (27/08) : montants du PDF au code ISO (« 1 234,00 EUR »), jamais au symbole —
// la police Helvetica de jsPDF ne rend ni ₩ ni les espaces insécables/fines d'Intl.
// Espaces U+00A0/U+202F remplacées par des espaces simples pour la même raison.
function pdfMoney(v, currencyCode) {
  const n = Number(v) || 0
  try {
    return new Intl.NumberFormat(localeTag(), { style: 'currency', currency: currencyCode, currencyDisplay: 'code' })
      .format(n).replace(/[\u00A0\u202F]/g, ' ')
  } catch (_) {
    return n.toFixed(2) + ' ' + (currencyCode || '')
  }
}

export function downloadPdf(q, laws, billingCountry, t, clientName) {
  const doc = new jsPDF()
  const l = laws

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(q.company || clientName || t('qt_default_company'), 20, 25)

  doc.setDrawColor(200, 200, 200)
  doc.line(20, 32, 190, 32)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(t('qt_title') + ' — ' + q.id, 20, 45)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(t('qt_create_date') + ' : ' + q.createdAt, 20, 55)
  doc.text(t('qt_field_status') + ' : ' + t('qt_filter_' + q.status), 20, 62)
  doc.text(l.name + ' — ' + l.taxName + ' ' + l.taxRate + '%', 20, 72)

  doc.line(20, 78, 190, 78)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(t('qt_field_title') + ' :', 20, 88)
  doc.setFont('helvetica', 'normal')
  const titleLines = doc.splitTextToSize(q.title, 170)
  doc.text(titleLines, 20, 96)

  doc.setFontSize(10)
  doc.text(t('qt_field_amount') + ' (HT) : ' + pdfMoney(q.amount, l.currency), 20, 110)
  doc.text(t('qt_field_tax') + ' (' + q.tax + '%) : ' + pdfMoney(q.amount * q.tax / 100, l.currency), 20, 118)

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(t('qt_ttc') + ' : ' + pdfMoney(q.amount * (1 + q.tax / 100), l.currency), 20, 130)

  if (q.notes) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.line(20, 138, 190, 138)
    doc.text(t('qt_field_notes') + ' :', 20, 148)
    const noteLines = doc.splitTextToSize(q.notes, 170)
    doc.text(noteLines, 20, 156)
  }

  doc.setFontSize(8)
  doc.setTextColor(150)
  const privacyLines = doc.splitTextToSize(l.privacy, 170)
  doc.text(privacyLines, 20, 268)
  const legalY = 268 + (privacyLines.length * 4)
  const countryCode = (q.country || billingCountry).toLowerCase()
  const legalLines = doc.splitTextToSize(t('law_' + countryCode + '_legal'), 170)
  doc.text(legalLines, 20, legalY)

  doc.save('devis-' + q.id + '.pdf')
}
