/**
 * CSV export for admin lists.
 *
 * Two things here are not optional, and both are the kind of detail that turns
 * an attendance list into a wrong attendance list:
 *
 * 1. QUOTING. Names and social handles contain commas, quotes and occasionally
 *    newlines. An unquoted field with a comma silently shifts every later
 *    column on that row - the list still opens, still looks like a list, and is
 *    wrong for exactly the rows with the messiest data.
 *
 * 2. FORMULA INJECTION. Excel and Google Sheets execute a cell beginning with
 *    = + - @ (or a tab/CR). A registrant whose name or social handle starts
 *    with one of those turns into a formula in a file staff open on a work
 *    machine. Prefixing with an apostrophe keeps the value readable and inert.
 *    This is public-submitted data going into a desktop spreadsheet, which is
 *    precisely the risky direction.
 */

const RISKY_LEAD = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (RISKY_LEAD.test(s)) s = `'${s}`
  // Always quote. Cheaper than deciding when not to, and never wrong.
  return `"${s.replace(/"/g, '""')}"`
}

/** Rows of primitives → CSV text, with a UTF-8 BOM so Excel reads accents. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))]
  // CRLF: RFC 4180, and the only line ending Excel handles without complaint.
  return '﻿' + lines.join('\r\n')
}

/** Turn a title into a safe, readable filename stem. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'export'
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
