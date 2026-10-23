// Pure helpers for the Wall of Honor print export (zip folder names, CSV).

/** A safe folder name: strips path and reserved characters, collapses whitespace, trims dots and spaces. */
export function sanitizeFolderName(raw: string): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  return cleaned || 'honoree'
}

/** sanitizeFolderName, with a numeric suffix when the name is already in `used` (case-insensitive). Adds the result to `used`. */
export function uniqueFolderName(raw: string, used: Set<string>): string {
  const base = sanitizeFolderName(raw)
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`
  used.add(name.toLowerCase())
  return name
}

/** RFC 4180 field: quoted when it holds a comma, quote, CR or LF; embedded quotes doubled. */
export function csvField(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map(csvField).join(',')
}
