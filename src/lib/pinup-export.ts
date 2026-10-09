/**
 * Every field a pinup entry carries, in one list (Ryan, 2026-10-09: "I need to
 * see everything submitted on the pinup form"). /admin/pinup's detail panel
 * and its CSV export both read PINUP_FIELDS, so a column added here appears in
 * both, and the two can never disagree.
 *
 * Columns: 051 (entry), 052 (marketing consent), 055 (likeness release); the
 * *_at consent timestamps are stamped by a database trigger (076), never the
 * browser.
 */
export interface PinupEntry {
  id: string
  event_id: string
  full_name: string
  stage_name: string | null
  email: string
  phone: string
  address: string | null
  notes: string | null
  age_confirmed: boolean
  likeness_release: boolean
  likeness_release_at: string | null
  marketing_opt_in: boolean
  marketing_opt_in_at: string | null
  marketing_opt_in_source: string | null
  status: string
  created_at: string
  updated_at: string
}

/** The select list for /admin/pinup: every column above. */
export const PINUP_SELECT =
  'id, event_id, full_name, stage_name, email, phone, address, notes, age_confirmed, likeness_release, likeness_release_at, marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source, status, created_at, updated_at'

/** Eastern time, the show's time zone, e.g. "Oct 8, 2026, 9:14 PM". */
export function formatEastern(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const yesNo = (b: boolean) => (b ? 'Yes' : 'No')

/**
 * `onlyIfSet`: left out of the admin panel while empty. The public form has no
 * notes field (Ryan, 2026-10-09: hide it), but /api/pinup-entry still accepts
 * one, so a row that does carry notes still shows them. The CSV keeps every column.
 */
export interface PinupField { key: string; label: string; value: (e: PinupEntry) => string; onlyIfSet?: boolean }

export const PINUP_FIELDS: readonly PinupField[] = [
  { key: 'full_name', label: 'Full name', value: e => e.full_name },
  { key: 'stage_name', label: 'Stage name', value: e => e.stage_name ?? '' },
  { key: 'status', label: 'Status', value: e => e.status },
  { key: 'email', label: 'Email', value: e => e.email },
  { key: 'phone', label: 'Phone', value: e => e.phone },
  { key: 'address', label: 'Address', value: e => e.address ?? '' },
  { key: 'notes', label: 'Notes', value: e => e.notes ?? '', onlyIfSet: true },
  { key: 'age_confirmed', label: 'Age confirmed (18+)', value: e => yesNo(e.age_confirmed) },
  { key: 'likeness_release', label: 'Likeness release', value: e => yesNo(e.likeness_release) },
  { key: 'likeness_release_at', label: 'Likeness release accepted (ET)', value: e => formatEastern(e.likeness_release_at) },
  { key: 'marketing_opt_in', label: 'Marketing opt-in', value: e => yesNo(e.marketing_opt_in) },
  { key: 'marketing_opt_in_at', label: 'Marketing opt-in at (ET)', value: e => formatEastern(e.marketing_opt_in_at) },
  { key: 'marketing_opt_in_source', label: 'Marketing opt-in source', value: e => e.marketing_opt_in_source ?? '' },
  { key: 'created_at', label: 'Registered (ET)', value: e => formatEastern(e.created_at) },
  { key: 'updated_at', label: 'Last updated (ET)', value: e => formatEastern(e.updated_at) },
  { key: 'id', label: 'Entry ID', value: e => e.id },
]

/**
 * One CSV cell. Quoted per RFC 4180, and a value that a spreadsheet would run
 * as a formula (= + - @, tab, CR) is prefixed with an apostrophe: these values
 * are typed by the public into the form, and the file is opened in Excel.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The whole export: a header row, then one row per entry, CRLF line ends, with a BOM so Excel reads UTF-8. */
export function pinupCsv(entries: readonly PinupEntry[]): string {
  const rows = [PINUP_FIELDS.map(f => csvCell(f.label)).join(',')]
  for (const e of entries) rows.push(PINUP_FIELDS.map(f => csvCell(f.value(e))).join(','))
  return '﻿' + rows.join('\r\n') + '\r\n'
}
