import Papa from 'papaparse'
import * as XLSX from 'xlsx'

/**
 * Parse an import file (CSV, XLSX, XLS) into structured data.
 * GDPR: all parsing is client-side, no data sent externally.
 *
 * @param {File} file - The uploaded file
 * @returns {Promise<Object>} Parsed data with headers, rows, sample, rowCount
 */
export async function parseImportFile(file) {
  if (!file || !file.name) {
    throw new Error('INVALID_FILE')
  }

  const ext = file.name.split('.').pop().toLowerCase()

  // --- Excel files (XLSX, XLS, XLSM) ---
  if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('EMPTY_WORKBOOK')

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      type: 'spreadsheet',
      headers,
      rows,
      sample: rows.slice(0, 5),
      rowCount: rows.length,
      fileName: file.name,
    }
  }

  // --- CSV / TSV files ---
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const text = await file.text()

    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete(result) {
          const rows = result.data || []
          const headers = result.meta?.fields || (rows.length > 0 ? Object.keys(rows[0]) : [])
          resolve({
            type: 'spreadsheet',
            headers,
            rows,
            sample: rows.slice(0, 5),
            rowCount: rows.length,
            fileName: file.name,
          })
        },
        error(err) {
          reject(new Error('CSV_PARSE_ERROR: ' + err.message))
        },
      })
    })
  }

  // --- JSON files ---
  if (ext === 'json') {
    const text = await file.text()
    const data = JSON.parse(text)
    const rows = Array.isArray(data) ? data : [data]
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      type: 'spreadsheet',
      headers,
      rows,
      sample: rows.slice(0, 5),
      rowCount: rows.length,
      fileName: file.name,
    }
  }

  // --- Unsupported format ---
  throw new Error('UNSUPPORTED_FORMAT')
}
