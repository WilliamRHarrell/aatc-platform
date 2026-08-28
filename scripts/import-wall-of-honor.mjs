#!/usr/bin/env node
/**
 * Wall of Honor media harvest.
 *
 * Reads a Gravity Forms entry export (CSV), downloads every attached photo, and
 * emits a manifest mapping file -> honoree -> year -> tribute text.
 *
 *   node scripts/import-wall-of-honor.mjs \
 *     --csv ./woh-form-81.csv \
 *     --out ./woh-import \
 *     --year 2026 \
 *     [--mirror /path/to/wp-content/uploads]   # fallback source
 *     [--dry-run]
 *
 * Design notes:
 * - RESUMABLE. Already-downloaded files are skipped, so it can be re-run after
 *    a partial failure or a network drop without refetching everything.
 * - NEVER FATAL on a single row. A bad URL is recorded as a failure in the
 *    manifest and the run continues. These are memorial records; losing the
 *    other 12 because one 404s is not acceptable.
 * - MIRROR FALLBACK. If --mirror is given (the wholesale /wp-content/uploads
 *    copy), a URL that fails is retried by basename against the mirror. The
 *    hashed URLs are unguessable but the underlying files are ordinary uploads,
 *    so the mirror should satisfy nearly everything.
 * - Records pixel dimensions and byte size per file so source quality can be
 *    judged per-image before deciding whether to re-request originals from
 *    families.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

// ── args ────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true])
    return acc
  }, [])
)
const CSV = args.csv
const OUT = args.out ?? './woh-import'
const YEAR = args.year ? Number(args.year) : null
const MIRROR = typeof args.mirror === 'string' ? args.mirror : null
const DRY = !!args['dry-run']
const BASE = 'https://allamericantattooconvention.com/'

if (!CSV) {
  console.error('Usage: --csv <export.csv> --out <dir> --year <2026|2025> [--mirror <uploads dir>] [--dry-run]')
  process.exit(1)
}

/**
 * ── COLUMN MAPPING ──────────────────────────────────────────
 * Gravity Forms exports use the FIELD LABEL as the header, so these cannot be
 * predicted from outside the install. Each entry is a list of candidate header
 * names, matched case-insensitively on a normalised (alphanumeric-only) basis;
 * the first hit wins. Add the real labels here once you have the CSV - the
 * script prints every unmatched header on startup so you can see what to add.
 */
const COLUMN_CANDIDATES = {
  entry_id:        ['entryid', 'id', 'entry'],
  created_at:      ['datecreated', 'date', 'entrydate', 'submitted'],
  honoree_name:    ['honoreename', 'nameofhonoree', 'servicemembername', 'heroname', 'nameofyourhero', 'fallenservicemember', 'name'],
  rank:            ['rank', 'rankgrade'],
  branch:          ['branch', 'branchofservice', 'service', 'militarybranch'],
  relationship:    ['relationship', 'yourrelationship', 'relationshiptohonoree'],
  tribute_text:    ['tribute', 'tributetext', 'story', 'theirstory', 'yourtribute', 'message', 'biography', 'bio'],
  submitter_name:  ['yourname', 'submittername', 'contactname', 'submittedby'],
  submitter_email: ['email', 'youremail', 'emailaddress'],
  submitter_phone: ['phone', 'yourphone', 'phonenumber'],
  year:            ['year', 'conventionyear', 'eventyear'],
}

/**
 * Photo columns. field-id=12 is the ONE we have evidence for, from your sample
 * URL - I cannot see form 81, so I cannot confirm it is the only photo field.
 * This matcher therefore treats ANY column whose value contains a gf-download
 * link or an uploads path as a photo column, whatever its label. Check the
 * startup report: if more than one photo column is discovered, form 81 has
 * multiple upload fields and all of them are being harvested.
 */
const PHOTO_HINT = /(gf-download=|\/wp-content\/uploads\/)/i

// ── minimal CSV parser (quoted fields, embedded newlines and commas) ─────────
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ── image dimensions from file headers (JPEG/PNG/GIF/WebP) ──────────────────
function dimensions(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {           // JPEG
      let o = 2
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue }
        const m = buf[o + 1]
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) }
        }
        o += 2 + buf.readUInt16BE(o + 2)
      }
    }
    if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') { // PNG
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    if (buf.slice(0, 3).toString() === 'GIF') {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
    }
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      if (buf.slice(12, 16).toString() === 'VP8X') {
        return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
      }
    }
  } catch { /* fall through */ }
  return null
}

/** Quality verdict, so low-res Facebook exports are visible per-file. */
function verdict(dim, bytes) {
  if (!dim) return 'unknown'
  const min = Math.min(dim.w, dim.h)
  if (min >= 1200) return 'good'
  if (min >= 700)  return 'usable'
  if (min >= 400)  return 'low - consider re-requesting original'
  return 'poor - re-request original'
}

// ── mirror lookup ───────────────────────────────────────────
let mirrorIndex = null
function buildMirrorIndex(dir) {
  const idx = new Map()
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (!idx.has(e.name)) idx.set(e.name, p)
    }
  }
  walk(dir)
  return idx
}

// ── extract candidate photo URLs from a cell ────────────────
function extractUrls(cell) {
  if (!cell) return []
  const raw = cell.trim()
  let parts = []
  // Gravity Forms multi-file fields are usually a JSON array.
  if (raw.startsWith('[')) {
    try { parts = JSON.parse(raw) } catch { parts = [] }
  }
  if (!parts.length) parts = raw.split(/[\n|,;]+/)
  return parts
    .map(s => String(s).trim())
    .filter(Boolean)
    .filter(s => PHOTO_HINT.test(s) || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(s))
    .map(s => (s.startsWith('http') ? s : BASE + s.replace(/^\//, '')))
}

/** Original filename out of a gf-download URL, else the path basename. */
function originalName(url) {
  const m = url.match(/gf-download=([^&]+)/)
  if (m) return basename(decodeURIComponent(m[1]))
  try { return basename(new URL(url).pathname) } catch { return basename(url) }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(url, attempts = 3) {
  let lastErr = null
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 100) throw new Error(`suspiciously small (${buf.length}b) - likely an error page`)
      return { buf, contentType: res.headers.get('content-type') ?? '' }
    } catch (e) {
      lastErr = e
      if (i < attempts) await sleep(700 * i)
    }
  }
  throw lastErr
}

// ── main ────────────────────────────────────────────────────
const rows = parseCsv(readFileSync(CSV, 'utf8'))
if (rows.length < 2) { console.error('CSV has no data rows.'); process.exit(1) }

const headers = rows[0]
const dataRows = rows.slice(1)

// Resolve mapped columns
const colIndex = {}
for (const [field, candidates] of Object.entries(COLUMN_CANDIDATES)) {
  const i = headers.findIndex(h => candidates.includes(norm(h)))
  if (i >= 0) colIndex[field] = i
}

// Discover photo columns by content, not by label.
const photoCols = []
headers.forEach((h, i) => {
  const hit = dataRows.some(r => PHOTO_HINT.test(r[i] ?? ''))
  if (hit) photoCols.push({ index: i, header: h })
})

const mappedIdx = new Set([...Object.values(colIndex), ...photoCols.map(p => p.index)])
const unmatched = headers.filter((h, i) => !mappedIdx.has(i) && dataRows.some(r => (r[i] ?? '').trim()))

console.log('══════ EXPORT REPORT ══════')
console.log(`  rows              : ${dataRows.length}`)
console.log(`  columns           : ${headers.length}`)
console.log('  mapped fields     :')
for (const [f, i] of Object.entries(colIndex)) console.log(`      ${f.padEnd(16)} <- "${headers[i]}"`)
const missing = Object.keys(COLUMN_CANDIDATES).filter(f => !(f in colIndex))
if (missing.length) console.log(`  UNMAPPED fields   : ${missing.join(', ')}  <- add the real labels to COLUMN_CANDIDATES`)
console.log(`  photo columns     : ${photoCols.length}`)
photoCols.forEach(p => console.log(`      col ${p.index}: "${p.header}"`))
if (photoCols.length > 1) {
  console.log('      ^ MORE THAN ONE photo field on this form. All are being harvested.')
} else if (photoCols.length === 1) {
  console.log('      ^ single photo field - consistent with field-id=12 being the only one.')
}
if (unmatched.length) console.log(`  unmatched, non-empty: ${unmatched.map(h => `"${h}"`).join(', ')}`)
console.log('')

if (MIRROR) {
  if (!existsSync(MIRROR)) { console.error(`Mirror not found: ${MIRROR}`); process.exit(1) }
  mirrorIndex = buildMirrorIndex(MIRROR)
  console.log(`  mirror indexed    : ${mirrorIndex.size} files from ${MIRROR}\n`)
}

if (DRY) { console.log('Dry run - stopping before download.'); process.exit(0) }

const FILES_DIR = join(OUT, 'files')
mkdirSync(FILES_DIR, { recursive: true })

const manifest = { source: CSV, year: YEAR, generatedFrom: 'gravity-forms-export', tributes: [], failures: [] }
let downloaded = 0, skipped = 0, fromMirror = 0, failed = 0

for (const [n, r] of dataRows.entries()) {
  const get = f => (colIndex[f] !== undefined ? (r[colIndex[f]] ?? '').trim() : '')
  const entryId = get('entry_id') || String(n + 1)
  const honoree = get('honoree_name') || `(unnamed entry ${entryId})`
  const year = YEAR ?? (Number(get('year')) || null)

  const urls = photoCols.flatMap(p => extractUrls(r[p.index]))
  const files = []

  for (const [k, url] of urls.entries()) {
    const orig = originalName(url)
    const safeHonoree = honoree.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    const target = `${year ?? 'unknown'}__${entryId}__${safeHonoree}__${k + 1}${extname(orig) || '.jpg'}`
    const dest = join(FILES_DIR, target)

    if (existsSync(dest)) {
      const buf = readFileSync(dest)
      const dim = dimensions(buf)
      files.push({ file: target, originalName: orig, sourceUrl: url, bytes: buf.length, dimensions: dim, quality: verdict(dim, buf.length), via: 'cached' })
      skipped++
      continue
    }

    let buf = null, via = null, err = null
    try {
      ;({ buf } = await fetchWithRetry(url))
      via = 'url'
    } catch (e) {
      err = e.message
      if (mirrorIndex?.has(orig)) {
        try { buf = readFileSync(mirrorIndex.get(orig)); via = 'mirror' } catch (e2) { err += ` | mirror: ${e2.message}` }
      }
    }

    if (!buf) {
      failed++
      manifest.failures.push({ entryId, honoree, url, originalName: orig, error: err })
      console.log(`  FAIL  ${honoree} :: ${orig} - ${err}`)
      continue
    }

    writeFileSync(dest, buf)
    if (via === 'mirror') fromMirror++; else downloaded++
    const dim = dimensions(buf)
    const q = verdict(dim, buf.length)
    files.push({ file: target, originalName: orig, sourceUrl: url, bytes: buf.length, dimensions: dim, quality: q, via })
    console.log(`  ok    ${honoree} :: ${orig}  ${dim ? `${dim.w}x${dim.h}` : '?'}  ${q}${via === 'mirror' ? '  (via mirror)' : ''}`)
    if (via === 'url') await sleep(250)   // be polite to the host
  }

  manifest.tributes.push({
    entryId,
    year,
    honoree,
    rank: get('rank') || null,
    branch: get('branch') || null,
    relationship: get('relationship') || null,
    tributeText: get('tribute_text') || null,   // migrate VERBATIM, typos included
    submitter: {
      name: get('submitter_name') || null,
      email: get('submitter_email') || null,
      phone: get('submitter_phone') || null,
    },
    createdAt: get('created_at') || null,
    files,
  })
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

const allFiles = manifest.tributes.flatMap(t => t.files)
const lowQuality = allFiles.filter(f => /low|poor/.test(f.quality))
const noText = manifest.tributes.filter(t => !t.tributeText)
const noPhoto = manifest.tributes.filter(t => !t.files.length)

console.log('\n══════ SUMMARY ══════')
console.log(`  tributes          : ${manifest.tributes.length}`)
console.log(`  files downloaded  : ${downloaded}   cached: ${skipped}   via mirror: ${fromMirror}   failed: ${failed}`)
console.log(`  low/poor quality  : ${lowQuality.length}${lowQuality.length ? '  <- candidates to re-request from families' : ''}`)
console.log(`  tributes w/o text : ${noText.length}`)
console.log(`  tributes w/o photo: ${noPhoto.length}`)
console.log(`  manifest          : ${join(OUT, 'manifest.json')}`)
if (failed) console.log(`\n  ${failed} failure(s) recorded in the manifest - re-run to retry, cached files are skipped.`)
