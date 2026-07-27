import type { QueryResult } from './api'

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function resultToObjects(result: QueryResult): Record<string, unknown>[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.fields.map((f, i) => [f.name, row[i]]))
  )
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function resultToCsv(result: QueryResult): string {
  const header = result.fields.map((f) => csvCell(f.name)).join(',')
  const lines = result.rows.map((row) => row.map(csvCell).join(','))
  // BOM so Excel opens it with correct encoding
  return '\uFEFF' + [header, ...lines].join('\r\n')
}

export function exportResultCsv(result: QueryResult, name = 'result') {
  downloadFile(`${name}.csv`, resultToCsv(result), 'text/csv;charset=utf-8')
}

export function exportResultJson(result: QueryResult, name = 'result') {
  downloadFile(`${name}.json`, JSON.stringify(resultToObjects(result), null, 2), 'application/json')
}
