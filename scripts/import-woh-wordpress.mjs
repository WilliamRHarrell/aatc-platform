#!/usr/bin/env node
/**
 * Wall of Honor WordPress import (PR 3, plan docs/superpowers/plans/2026-10-23-wall-of-honor-import.md).
 *
 *   node scripts/import-woh-wordpress.mjs --backup <unzipped site archive root> [--dry-run | --apply] [--out <report dir>]
 *
 * Reads the WordPress SQL dump (<root>/wp-content/mysql.sql) and the uploads
 * folder of an unzipped site archive. The archive is UNTRUSTED, READ-ONLY
 * input: this script only reads from it, never executes anything in it, never
 * copies it into the repo, and never writes its path into any output.
 *
 * Sources (prefix wp_):
 *   - Gravity Forms form 81 ("Gold Star story submission", 2026): wp_gf_entry
 *     + wp_gf_entry_meta. Meta 1 = honoree name, 14 = email, 15 = story,
 *     12 = photo URL or JSON array of URLs.
 *   - The two 2025 Wall of Honor pages, wp_posts 48157 and 48512, WPBakery
 *     post_content: vc_custom_heading text="RANK Name (birth-death)",
 *     vc_column_text = the tribute, vc_single_image image="id" and
 *     vc_gallery images="id,id" (plus any inline <img class="wp-image-id">),
 *     resolved through wp_postmeta._wp_attached_file to wp-content/uploads/.
 *
 * --dry-run (DEFAULT): parse and write the report only. Nothing is uploaded,
 *   no seed is written, no network call is made.
 * --apply: also uploads every kept photo to the private
 *   wall-of-honor-submissions bucket with the service role (.env.local), and
 *   writes supabase/seeds/woh_wordpress_import.sql and
 *   supabase/seeds/woh_wordpress_import_teardown.sql (both git-ignored: they
 *   embed family tributes and emails). Ryan runs the seed in a DIRECT SQL
 *   session; see supabase/seeds/woh_wordpress_import_README.md.
 *
 * Report: <out>/report.md (default ./woh-import-report/, git-ignored).
 */
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { join, resolve, dirname, basename, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)) // not .pathname: that keeps %20 for a space

// ── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const argVal = name => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }
const BACKUP = argVal('backup')
const APPLY = argv.includes('--apply')
if (APPLY && argv.includes('--dry-run')) { console.error('Pass --dry-run OR --apply, not both.'); process.exit(1) }
const OUT = resolve(argVal('out') ?? join(ROOT, 'woh-import-report'))
if (!BACKUP) {
  console.error('Usage: node scripts/import-woh-wordpress.mjs --backup <unzipped site archive root> [--dry-run | --apply] [--out <report dir>]')
  process.exit(1)
}
const BACKUP_ROOT = realpathSync(resolve(BACKUP))
const DUMP = join(BACKUP_ROOT, 'wp-content', 'mysql.sql')
const UPLOADS = join(BACKUP_ROOT, 'wp-content', 'uploads')
if (!existsSync(DUMP)) { console.error('No wp-content/mysql.sql under --backup.'); process.exit(1) }
if (!existsSync(UPLOADS)) { console.error('No wp-content/uploads under --backup.'); process.exit(1) }

// ── constants ───────────────────────────────────────────────
const PREFIX = 'wp_'
const GF_FORM_ID = '81'
const GF_FIELD = { name: '1', email: '14', story: '15', photos: '12' }
// Same values as src/lib/wall-of-honor-submission.ts (WOH_SUBMISSIONS_BUCKET,
// WOH_PHOTO_MAX_BYTES) and the bucket's allowed_mime_types (104).
const BUCKET = 'wall-of-honor-submissions'
const MAX_BYTES = 10 * 1024 * 1024
const WALL_PHOTO_CAP = 3
const SEED_PATH = join(ROOT, 'supabase', 'seeds', 'woh_wordpress_import.sql')
const TEARDOWN_PATH = join(ROOT, 'supabase', 'seeds', 'woh_wordpress_import_teardown.sql')

// Event names are EXACTLY migration 106's inserts. The seed looks each one up by name.
const EV_2025_EAST = 'AATC 2025 East'
const EV_2025_WEST = 'AATC 2025 West'
const EV_2026_EAST = 'AATC 2026 East'
const EVENT_NAMES = [EV_2025_EAST, EV_2025_WEST, EV_2026_EAST]

// RULING (controller, 2026-10-23, correcting the brief's slip): the two 2025
// pages and their events. The brief had them the other way round; the dump
// shows 48157 (created April 2025) was rewritten in September for the WEST
// wall, and 48512 (created September 2025) archives the April EAST content.
// Two independent signals must BOTH agree with each assignment or the script
// aborts (assertPageEvent), so a re-run against different data can never
// silently put a memorial under the wrong event:
//   expectParent: the WordPress parent page's title contains this word;
//   expectMonth:  the majority yyyy/mm of the page's attachments' _wp_attached_file
//                 paths (the month the photos were uploaded: the event month).
const PAGES = [
  { postId: '48512', event: EV_2025_EAST, label: '2025 East', expectParent: 'East', expectMonth: '2025/04' },
  { postId: '48157', event: EV_2025_WEST, label: '2025 West', expectParent: 'West', expectMonth: '2025/09' },
]
// What the brief first said, kept only so the report can state the swap.
const BRIEF_MAPPING = { '48157': EV_2025_EAST, '48512': EV_2025_WEST }
// RULING: every form 81 entry (submitted Feb-Apr 2026) belongs to AATC 2026 East.
const GF_EVENT = EV_2026_EAST

// RULING: skip GF #34877, a byte-identical duplicate of #34875 (same name,
// email and story; it carries no photos). Re-checked below and reported.
const GF_SKIP_DUPLICATE = { skip: '34877', of: '34875' }
// RULING (Mikos): skip row #34920 (a second submission for the same honoree,
// same email, no story) but upload its photos that are not byte-identical
// duplicates into #34717's folder, and say so in #34717's admin_notes.
const GF_FOLD = { skip: '34920', into: '34717' }
// RULING (Perry): import BOTH Dominic Perry entries (the 2025 page heading and
// GF #34719) as separate rows, and flag the pair in the report.
const PERRY = { gfId: '34719', pageNamePattern: /dominic\s+perry/i }
// RULING: GF #34889 has no email; it imports with submitter_email '' (the
// publish email gate already skips imported rows and empty addresses).
const GF_NO_EMAIL = '34889'

// ── 1. streaming SQL-dump parser ────────────────────────────
// Column names come from each table's CREATE TABLE, never by position
// (wp_gf_entry's last column is source_id, not status).
const T = { entry: `${PREFIX}gf_entry`, meta: `${PREFIX}gf_entry_meta`, posts: `${PREFIX}posts`, postmeta: `${PREFIX}postmeta` }

/** Yields each (...) tuple of one INSERT ... VALUES line as an array of strings/null. */
function* tuples(line, start) {
  let i = start
  const n = line.length
  while (i < n) {
    while (i < n && line[i] !== '(') i++
    if (i >= n) return
    i++
    const row = []
    for (;;) {
      if (line[i] === "'") {
        i++
        let s = ''
        for (;;) {
          if (i >= n) throw new Error('unterminated string in dump')
          const c = line[i]
          if (c === '\\') {
            const e = line[i + 1]
            s += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '0' ? '\0' : e === 'b' ? '\b' : e === 'Z' ? '\x1a' : e
            i += 2
          } else if (c === "'") { i++; break } else { s += c; i++ }
        }
        row.push(s)
      } else {
        let j = i
        while (j < n && line[j] !== ',' && line[j] !== ')') j++
        const tok = line.slice(i, j)
        row.push(tok === 'NULL' ? null : tok)
        i = j
      }
      if (line[i] === ',') { i++; continue }
      if (line[i] === ')') { i++; break }
      throw new Error(`unexpected character in dump tuple at ${i}`)
    }
    yield row
  }
}

const cols = {}
const gfEntries = []          // form 81 rows
const gfMeta = []             // form 81 meta rows
const pagesById = new Map()   // every page: ID -> {title, name, parent}
const targetPages = new Map() // the two wall pages, full rows
const attachments = new Map() // attachment ID -> {date, parent, title}
const attachedFile = new Map() // attachment ID -> _wp_attached_file
const seenTables = new Set()

async function parseDump() {
  let cur = null
  const rl = createInterface({ input: createReadStream(DUMP, 'utf8'), crlfDelay: Infinity })
  const want = new Set(Object.values(T))
  const pageIds = new Set(PAGES.map(p => p.postId))
  for await (const line of rl) {
    let m
    if ((m = line.match(/^CREATE TABLE `(\w+)` \(/))) { cur = m[1]; cols[cur] = []; continue }
    if (cur !== null) {
      if (line.startsWith(')')) { cur = null; continue }
      const c = line.match(/^\s+`(\w+)` /)
      if (c) cols[cur].push(c[1])
      continue
    }
    if (!(m = line.match(/^INSERT INTO `(\w+)` VALUES /)) || !want.has(m[1])) continue
    const table = m[1], C = cols[table]
    if (!C?.length) throw new Error(`INSERT into ${table} before its CREATE TABLE`)
    seenTables.add(table)
    for (const r of tuples(line, m[0].length)) {
      if (r.length !== C.length) throw new Error(`${table}: a row has ${r.length} values, CREATE TABLE has ${C.length} columns`)
      const o = {}
      for (let k = 0; k < C.length; k++) o[C[k]] = r[k]
      if (table === T.entry) { if (o.form_id === GF_FORM_ID) gfEntries.push(o) }
      else if (table === T.meta) { if (o.form_id === GF_FORM_ID) gfMeta.push(o) }
      else if (table === T.postmeta) { if (o.meta_key === '_wp_attached_file') attachedFile.set(o.post_id, o.meta_value) }
      else if (table === T.posts) {
        if (o.post_type === 'page') pagesById.set(o.ID, { title: o.post_title, name: o.post_name, parent: o.post_parent })
        if (o.post_type === 'attachment') attachments.set(o.ID, { date: o.post_date_gmt, parent: o.post_parent, title: o.post_title })
        if (pageIds.has(o.ID)) targetPages.set(o.ID, o)
      }
    }
  }
  for (const t of Object.values(T)) if (!seenTables.has(t)) throw new Error(`table ${t} has no rows in the dump (wrong prefix?)`)
  const need = { [T.entry]: ['id', 'form_id', 'date_created', 'status'], [T.meta]: ['entry_id', 'form_id', 'meta_key', 'meta_value'],
    [T.posts]: ['ID', 'post_content', 'post_date_gmt', 'post_type', 'post_parent', 'post_title'], [T.postmeta]: ['post_id', 'meta_key', 'meta_value'] }
  for (const [t, list] of Object.entries(need)) for (const c of list) if (!cols[t].includes(c)) throw new Error(`${t} has no column ${c}`)
}

// ── 2. files on disk (read-only, never outside uploads/) ────
function insideUploads(rel) {
  const abs = resolve(UPLOADS, rel)
  if (abs !== UPLOADS && !abs.startsWith(UPLOADS + sep)) return null // a ../ path in untrusted data
  return abs
}
/** wp-content/uploads relative path out of an uploads URL, or null. */
function relFromUrl(url) {
  const m = String(url).match(/\/wp-content\/uploads\/([^?#]+)/)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}
const dirCache = new Map()
function listDir(dir) {
  if (!dirCache.has(dir)) { try { dirCache.set(dir, readdirSync(dir)) } catch { dirCache.set(dir, []) } }
  return dirCache.get(dir)
}

// WordPress size variants: -WxH, -scaled, -rotated[-N] before the extension.
const VARIANT_RE = /^(.*)-(\d+x\d+|scaled|rotated(?:-\d+)?)(\.(?:jpe?g|png|webp|gif|heic))$/i
/**
 * The original a variant was made from, ONLY when that original exists:
 * returns the base path or null. A variant whose base is not on disk is an
 * honoree's only copy and is kept (Review Focus 2).
 */
function variantBase(absPath, exists = existsSync) {
  // Recurses through stacked suffixes (foo-scaled-300x200.jpg -> foo-scaled.jpg
  // -> foo.jpg) and returns the deepest one on disk, so a downscaled copy is never
  // imported while a truer original exists.
  let found = null, name = basename(absPath), m
  while ((m = name.match(VARIANT_RE))) {
    name = m[1] + m[3]
    const candidate = join(dirname(absPath), name)
    if (exists(candidate)) found = candidate
  }
  return found
}
/** Self-check of the variant rule, run on every invocation and shown in the report. */
function variantSelfCheck() {
  const fake = set => p => set.has(p)
  const cases = [
    ['/u/foo-scaled.jpg', new Set(['/u/foo-scaled.jpg']), null, 'only foo-scaled.jpg exists: kept'],
    ['/u/foo-scaled.jpg', new Set(['/u/foo-scaled.jpg', '/u/foo.jpg']), '/u/foo.jpg', 'foo.jpg exists: foo-scaled.jpg skipped'],
    ['/u/foo-300x200.png', new Set(['/u/foo-300x200.png']), null, 'only foo-300x200.png exists: kept'],
    ['/u/foo-rotated-1.jpeg', new Set(['/u/foo.jpeg']), '/u/foo.jpeg', 'foo.jpeg exists: foo-rotated-1.jpeg skipped'],
    ['/u/unnamed-10.jpg', new Set(['/u/unnamed.jpg']), null, 'unnamed-10.jpg is not a variant pattern'],
    ['/u/IMG_20260220_1526221.jpg', new Set(['/u/IMG_20260220_152622.jpg']), null, 'a numbered upload is not a variant'],
    ['/u/foo-scaled-300x200.jpg', new Set(['/u/foo-scaled.jpg', '/u/foo.jpg']), '/u/foo.jpg', 'foo-scaled-300x200.jpg resolves past foo-scaled.jpg to foo.jpg'],
    ['/u/foo-scaled-300x200.jpg', new Set(['/u/foo-scaled.jpg']), '/u/foo-scaled.jpg', 'foo-scaled-300x200.jpg -> foo-scaled.jpg when foo.jpg is missing'],
  ]
  return cases.map(([p, set, want, label]) => ({ label, ok: variantBase(p, fake(set)) === want }))
}
/** Every size variant of an original that sits beside it on disk (reported, never copied). */
function siblingVariants(absPath) {
  const stem = basename(absPath, extname(absPath)), ext = extname(absPath).toLowerCase()
  return listDir(dirname(absPath)).filter(n => {
    const m = n.match(VARIANT_RE)
    return m && m[1] === stem && m[3].toLowerCase() === ext
  }).sort()
}

function sniffType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { ext: 'png', mime: 'image/png' }
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  return null
}
/** Pixel size from file headers (JPEG/PNG/WebP), as in scripts/import-wall-of-honor.mjs. */
function dimensions(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue }
        const mk = buf[o + 1]
        if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) }
        o += 2 + buf.readUInt16BE(o + 2)
      }
    }
    if (buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
      const kind = buf.subarray(12, 16).toString()
      if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
      if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
    }
  } catch { /* unknown */ }
  return null
}
/** Shortest-side thresholds shared with photoQuality() in src/lib/wall-of-honor-submission.ts. */
/** WordPress writes 0000-00-00 00:00:00 for "no date": treat it as undated, never as a timestamp. */
const isRealDate = d => typeof d === 'string' && d !== '' && !/^0000/.test(d)
/**
 * Encodings that survived decodeEntities: an HTML entity (&name; or &#...) or
 * WPBakery's attribute quoting (`` for a double quote, `{` and `}` for brackets).
 * Any hit in a name or tribute is BLOCKING: a memorial must not ship with them.
 */
const residualEncoding = s => (s.match(/&\w+;|&#|``|`\{`|`\}`/g) ?? [])
const fmtDim = p => (p.dim ? `${p.dim.w}x${p.dim.h}` : '?x?')
const quality = d => (!d ? 'unknown' : Math.min(d.w, d.h) >= 1200 ? 'good' : Math.min(d.w, d.h) >= 700 ? 'usable' : 'low')

// ── 3. page content helpers ─────────────────────────────────
const attr = (s, name) => (s.match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? null
function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
/**
 * The tribute text of a vc_column_text: the WORDS verbatim (typos included);
 * only the HTML markup the page editor added is removed (<span style>, <p>,
 * <div>, <a>, <img>): <br> and the end of a <p>/<div> become a line break,
 * runs of 3+ line breaks become one blank line, CRLF becomes LF, ends trimmed.
 */
function tributeFromHtml(html) {
  const text = decodeEntities(html.replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, ''))
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── 4. build the honorees ───────────────────────────────────
const problems = []   // blocking: --apply refuses while any exist
const warnings = []   // shown to Ryan, not blocking
const info = []

function gfHonorees() {
  const byEntry = new Map()
  for (const m of gfMeta) {
    if (!byEntry.has(m.entry_id)) byEntry.set(m.entry_id, [])
    byEntry.get(m.entry_id).push(m)
  }
  const field = (id, key) => (byEntry.get(id) ?? []).find(m => m.meta_key === key)?.meta_value ?? null
  const photoUrls = id => {
    const raw = (field(id, GF_FIELD.photos) ?? '').trim()
    if (!raw) return []
    if (raw.startsWith('[')) { try { return JSON.parse(raw).map(String) } catch { warnings.push(`GF #${id}: field 12 is not valid JSON: kept as one URL`) } }
    return [raw]
  }
  // Fields form 81 has that this importer does not map (hash keys are GF's own file-upload bookkeeping).
  const known = new Set([...Object.values(GF_FIELD), 'submission_speeds', 'is_approved'])
  const unmapped = new Set(gfMeta.map(m => m.meta_key).filter(k => !known.has(k) && !/^[0-9a-f]{64,}$/.test(k)))
  if (unmapped.size) warnings.push(`GF form 81 meta keys not imported: ${[...unmapped].join(', ')}`)

  const entries = [...gfEntries].sort((a, b) => +a.id - +b.id)
  const ids = new Set(entries.map(e => e.id))
  for (const id of [GF_SKIP_DUPLICATE.skip, GF_SKIP_DUPLICATE.of, GF_FOLD.skip, GF_FOLD.into, PERRY.gfId, GF_NO_EMAIL]) {
    if (!ids.has(id)) throw new Error(`GF #${id} named in a hard-coded ruling is not in this dump: the rulings are for a different backup`)
  }
  const sourceSummary = { total: entries.length, inactive: [], skipped: [] }
  const out = []
  for (const e of entries) {
    if (e.status !== 'active') { sourceSummary.inactive.push(`#${e.id} (status ${e.status})`); continue }
    const name = field(e.id, GF_FIELD.name) ?? '', email = field(e.id, GF_FIELD.email) ?? '', story = field(e.id, GF_FIELD.story) ?? ''
    if (e.id === GF_SKIP_DUPLICATE.skip) {
      // RULING: #34877 skipped as a duplicate of #34875. Re-verify the premise.
      const o = GF_SKIP_DUPLICATE.of
      const same = name === field(o, GF_FIELD.name) && email === field(o, GF_FIELD.email) && story === field(o, GF_FIELD.story)
      // BLOCKING: a ruling whose premise no longer holds must never be applied silently.
      if (!same) problems.push(`GF #${e.id}: ruled a duplicate of #${o}, but its name/email/story differ from #${o}. The ruling does not fit this data.`)
      sourceSummary.skipped.push(`#${e.id} ${name}: duplicate of #${o} (ruling; name, email and story ${same ? 'identical' : 'NOT identical'}; ${photoUrls(e.id).length} photos)`)
      continue
    }
    if (e.id === GF_FOLD.skip) {
      // RULING (Mikos): #34920 is not its own row; its photos fold into #34717 below.
      const i = GF_FOLD.into
      const sameHonoree = name === field(i, GF_FIELD.name) && email === field(i, GF_FIELD.email)
      if (!sameHonoree) problems.push(`GF #${e.id}: ruled the same honoree as #${i}, but the name or email differs. The ruling does not fit this data.`)
      sourceSummary.skipped.push(`#${e.id} ${name}: not its own entry; its non-duplicate photos go into #${i}'s folder (ruling, Mikos; story ${story.trim() ? 'PRESENT' : 'empty'})`)
      continue
    }
    if (e.id === GF_NO_EMAIL && email) problems.push(`GF #${GF_NO_EMAIL} was ruled to have no email but has one. The ruling does not fit this data.`)
    const photos = photoUrls(e.id).map(u => ({ from: `GF #${e.id} field 12`, url: u, rel: relFromUrl(u) }))
    if (e.id === GF_FOLD.into) {
      for (const u of photoUrls(GF_FOLD.skip)) photos.push({ from: `GF #${GF_FOLD.skip} field 12 (folded in, Mikos ruling)`, url: u, rel: relFromUrl(u), foldedFrom: GF_FOLD.skip })
    }
    out.push({
      key: `gf-${e.id}`, source: `GF form 81 entry #${e.id}`, gfId: e.id, event: GF_EVENT,
      honoree_name: name, tribute: story, // RULING: verbatim, typos included, never trimmed or edited
      submitter_email: email,             // '' when the form row has none (#34889)
      date: e.date_created,               // GF stores date_created in UTC
      lifeYears: null, photoRefs: photos,
    })
  }
  return { out, sourceSummary }
}

/**
 * RULING 1 (controller, 2026-10-23): a page's event is only trusted when BOTH
 * signals agree with PAGES: the parent page title names the event (East/West)
 * AND the majority upload month of its referenced attachments' files is the
 * event month. Any disagreement aborts the whole run: a memorial must never be
 * attributed to the wrong event because the data changed under the script.
 */
function assertPageEvent(pg, summary, referenced) {
  // The title must name this event AND not the other one (a title naming both proves nothing).
  const opposite = pg.expectParent === 'East' ? 'West' : 'East'
  const parentOk = new RegExp(`\\b${pg.expectParent}\\b`, 'i').test(summary.parentTitle) && !new RegExp(`\\b${opposite}\\b`, 'i').test(summary.parentTitle)
  const months = new Map()
  for (const id of referenced) {
    const m = (attachedFile.get(id) ?? '').match(/^(\d{4}\/\d{2})\//)
    const k = m ? m[1] : '(no dated path)'
    months.set(k, (months.get(k) ?? 0) + 1)
  }
  const ranked = [...months].sort((a, b) => b[1] - a[1])
  const majority = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null
  const monthOk = majority === pg.expectMonth
  summary.parentOk = parentOk
  summary.monthCounts = ranked.map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'
  summary.majorityMonth = majority
  if (!parentOk || !monthOk) {
    throw new Error(`Page ${pg.postId} is assigned to ${pg.event}, but the dump disagrees: parent page "${summary.parentTitle}" (${parentOk ? 'agrees' : `does not name ${pg.expectParent} alone`}); attachment months ${summary.monthCounts} (majority ${majority ?? 'none'}, expected ${pg.expectMonth}). Nothing was written. Re-check PAGES before importing.`)
  }
}

function pageHonorees() {
  const out = [], summaries = []
  for (const pg of PAGES) {
    const row = targetPages.get(pg.postId)
    if (!row) throw new Error(`page ${pg.postId} is not in wp_posts`)
    const parent = pagesById.get(row.post_parent)
    const parentTitle = parent?.title ?? `(post ${row.post_parent})`
    const summary = { ...pg, title: row.post_title, slug: row.post_name, postDate: row.post_date_gmt, modified: row.post_modified_gmt,
      parentTitle, honorees: 0, columnsWithoutHeading: [], attachmentDates: [], unreferenced: [], usedElsewhere: [] }
    const referenced = new Set()
    const pageOut = []
    const columns = row.post_content.split(/\[vc_column(?:\s[^\]]*)?\]/).slice(1).map(c => c.split('[/vc_column]')[0])
    for (const [ci, col] of columns.entries()) {
      const heading = col.match(/\[vc_custom_heading\b([^\]]*)\]/)
      if (!heading) {
        const text = tributeFromHtml((col.match(/\[vc_column_text[^\]]*\]([\s\S]*?)\[\/vc_column_text\]/) ?? [])[1] ?? '')
        summary.columnsWithoutHeading.push(`column ${ci + 1}: ${text ? `text, ${text.length} chars ("${text.slice(0, 60)}...")` : 'empty'}`)
        continue
      }
      const headingText = decodeEntities(attr(heading[1], 'text') ?? '')
      // RULING: the name verbatim minus the parenthesized life years; the
      // years go to admin_notes, labeled, NEVER to service_years.
      const ly = headingText.match(/^(.*?)\s*\(([^()]*\d{4}[^()]*)\)\s*$/)
      const name = ly ? ly[1] : headingText
      if (!ly) warnings.push(`Page ${pg.postId}: heading "${headingText}" has no (birth-death) years`)
      const texts = [...col.matchAll(/\[vc_column_text[^\]]*\]([\s\S]*?)\[\/vc_column_text\]/g)].map(m => m[1])
      const rawTribute = texts.join('\n\n')
      const tribute = tributeFromHtml(rawTribute)
      // Photos in page order: single images, galleries and inline <img>, as they appear.
      const photoRefs = []
      const re = /\[vc_single_image\b([^\]]*)\]|\[vc_gallery\b([^\]]*)\]|<img\b([^>]*)>/g
      for (const m of col.matchAll(re)) {
        let ids = [], label = ''
        if (m[1] !== undefined) { ids = [attr(m[1], 'image')]; label = 'vc_single_image' }
        else if (m[2] !== undefined) { ids = (attr(m[2], 'images') ?? '').split(','); label = 'vc_gallery' }
        else {
          const wpId = (m[3].match(/wp-image-(\d+)/) ?? [])[1]
          label = 'inline <img> in the tribute'
          if (wpId) ids = [wpId]
          else { const rel = relFromUrl(attr(m[3], 'src') ?? ''); photoRefs.push({ from: `${label} (src)`, rel }); continue }
        }
        for (const id of ids.map(s => (s ?? '').trim()).filter(Boolean)) {
          referenced.add(id)
          const att = attachments.get(id)
          if (att?.date) summary.attachmentDates.push(att.date)
          photoRefs.push({ from: `${label} attachment ${id}`, attachmentId: id, rel: attachedFile.get(id) ?? null })
        }
      }
      summary.honorees++
      // RULING 2 (controller, 2026-10-23): submitted_at/consent_at = the
      // EARLIEST upload date among this honoree's own attachments (the closest
      // real signal to when the family handed over the materials; both pages'
      // post_date contradicts their content). Fallback below.
      const ownDates = photoRefs.map(r => attachments.get(r.attachmentId)?.date).filter(isRealDate).sort()
      pageOut.push({
        key: `page-${pg.postId}-${ci + 1}`, source: `${pg.label} page (post ${pg.postId}), column ${ci + 1}`, pagePostId: pg.postId, event: pg.event,
        honoree_name: name, tribute, markupStripped: rawTribute.trim() !== tribute,
        submitter_email: '',
        date: ownDates[0] ?? null,
        dateSource: ownDates.length ? `earliest upload date of this honoree's own ${ownDates.length === 1 ? 'photo' : `${ownDates.length} photos`}` : null,
        lifeYears: ly ? ly[2] : null, pageLabel: pg.label, photoRefs,
      })
    }
    // RULING 2 fallback: no dated attachment of its own -> the earliest upload date among the page's attachments.
    const pageEarliest = summary.attachmentDates.filter(isRealDate).sort()[0] ?? null
    for (const h of pageOut) if (!h.date) { h.date = pageEarliest; h.dateSource = `fallback: no dated photo of its own; earliest upload date among the ${pg.label} page's photos` }
    out.push(...pageOut)
    summary.referenced = referenced
    assertPageEvent(pg, summary, referenced)
    summaries.push(summary)
  }
  // Attachments uploaded to a wall page: used on the other wall page (WordPress
  // keeps the page they were first uploaded to as their parent), or not used at all.
  for (const s of summaries) {
    for (const [id, a] of attachments) {
      if (a.parent !== s.postId || s.referenced.has(id)) continue
      const other = summaries.find(o => o.referenced.has(id))
      if (other) s.usedElsewhere.push(id)
      else s.unreferenced.push(`attachment ${id} ${attachedFile.get(id) ?? '(no file)'}`)
    }
  }
  return { out, summaries }
}

// ── 5. the photo pipeline ───────────────────────────────────
function processPhotos(h) {
  h.kept = []; h.skipped = []; h.diskVariants = []
  const seenPaths = new Map(), seenHashes = new Map()
  for (const ref of h.photoRefs) {
    const label = ref.rel ?? ref.url ?? '(no path)'
    if (!ref.rel) { h.skipped.push({ file: label, from: ref.from, reason: 'UNRESOLVED: no wp-content/uploads path for this reference' }); warnings.push(`${h.honoree_name}: unresolved photo reference (${ref.from})`); continue }
    let abs = insideUploads(ref.rel)
    if (!abs) { h.skipped.push({ file: ref.rel, from: ref.from, reason: 'REFUSED: path leaves wp-content/uploads' }); problems.push(`${h.honoree_name}: a photo path leaves wp-content/uploads`); continue }
    if (!existsSync(abs)) { h.skipped.push({ file: ref.rel, from: ref.from, reason: 'MISSING on disk' }); warnings.push(`${h.honoree_name}: ${ref.rel} is missing on disk`); continue }
    // RULING: skip a size variant ONLY when its base original exists; copy the original instead.
    const base = variantBase(abs)
    if (base) {
      h.skipped.push({ file: ref.rel, from: ref.from, reason: `WordPress size variant; its original ${basename(base)} is copied instead` })
      abs = base
    }
    const rel = abs.slice(UPLOADS.length + 1)
    if (seenPaths.has(abs)) { h.skipped.push({ file: rel, from: ref.from, reason: `same file already referenced (${seenPaths.get(abs)})` }); continue }
    seenPaths.set(abs, ref.from)
    const buf = readFileSync(abs)
    const sha = createHash('sha256').update(buf).digest('hex')
    // RULING: byte-identical duplicates (sha-256) are copied once.
    if (seenHashes.has(sha)) { h.skipped.push({ file: rel, from: ref.from, reason: `byte-identical duplicate of ${seenHashes.get(sha)} (sha-256)` }); continue }
    seenHashes.set(sha, rel)
    const type = sniffType(buf), dim = dimensions(buf)
    const photo = { rel, from: ref.from, foldedFrom: ref.foldedFrom ?? null, bytes: buf.length, sha, type, dim, quality: quality(dim), keptVariant: !!basename(abs).match(VARIANT_RE) }
    if (!type) problems.push(`${h.honoree_name}: ${rel} is not JPEG/PNG/WebP (the bucket refuses it)`)
    if (buf.length > MAX_BYTES) problems.push(`${h.honoree_name}: ${rel} is ${buf.length} bytes, over the bucket's 10 MB limit`)
    h.kept.push(photo)
    for (const v of siblingVariants(abs)) h.diskVariants.push(v)
  }
}

// ── main ────────────────────────────────────────────────────
await parseDump()
const selfCheck = variantSelfCheck()
if (selfCheck.some(c => !c.ok)) problems.push('The variant-filter self-check failed (see report)')

const gf = gfHonorees()
const pages = pageHonorees()
// Order: 2025 East, 2025 West, then the 2026 form.
const honorees = [...PAGES.flatMap(p => pages.out.filter(h => h.pagePostId === p.postId)), ...gf.out]
for (const h of honorees) processPhotos(h)

// The Perry pair (RULING: both import; flagged here).
const perryPage = pages.out.filter(h => PERRY.pageNamePattern.test(h.honoree_name))
const perryGf = gf.out.find(h => h.gfId === PERRY.gfId)
if (perryPage.length !== 1 || !perryGf || !PERRY.pageNamePattern.test(perryGf.honoree_name)) throw new Error('Perry ruling: expected exactly one "Dominic Perry" page heading and GF #34719 named Dominic Perry')

// Ids and storage paths. Fresh per run: the seed embeds them, so the seed and
// the uploads from one --apply run belong together.
const rand = () => randomBytes(4).toString('hex')
for (const h of honorees) {
  h.id = randomUUID()
  h.kept.forEach((p, i) => { p.path = `${h.id}/photo-${String(i).padStart(2, '0')}-${rand()}.${p.type?.ext ?? 'bin'}` })
}

// admin_notes, composed from facts only.
for (const h of honorees) {
  const notes = [h.gfId ? `Imported from WordPress: Gravity Forms form 81 entry #${h.gfId}.` : `Imported from WordPress: the AATC ${h.pageLabel} Wall of Honor page (post ${h.pagePostId}).`]
  if (h.lifeYears) notes.push(`Life years, from the ${h.pageLabel} page heading: ${h.lifeYears}`)
  if (h.gfId === GF_FOLD.into) {
    const folded = h.kept.filter(p => p.foldedFrom === GF_FOLD.skip).map(p => basename(p.rel))
    const dupes = h.skipped.filter(s => /34920/.test(s.from)).map(s => basename(s.file))
    notes.push(`WordPress entry #${GF_FOLD.skip} (a second submission for this honoree, same email, no story) was not imported as its own entry. Its photos were added to this entry's folder: ${folded.join(', ') || 'none'}${dupes.length ? `; not added, byte-identical to a photo already here: ${dupes.join(', ')}` : ''}.`)
  }
  if (h === perryGf) notes.push(`The same honoree may also be on the AATC ${perryPage[0].pageLabel} page ("${perryPage[0].honoree_name}"), imported as a separate entry.`)
  if (h === perryPage[0]) notes.push(`The same honoree may also be on the 2026 form (Gravity Forms #${PERRY.gfId}, "${perryGf.honoree_name}"), imported as a separate entry.`)
  if (!h.submitter_email) notes.push('No submitter email on WordPress.')
  h.admin_notes = notes.join('\n')
  h.photo_paths = h.kept.length ? [h.kept[0].path] // RULING: only the old page's first photo, as a suggestion
    : []
  if (!h.kept.length) warnings.push(`${h.honoree_name}: no photo at all (the wall needs one before publishing)`)
  else if (h.kept[0].dim && Math.min(h.kept[0].dim.w, h.kept[0].dim.h) < 400) warnings.push(`${h.honoree_name}: the suggested main photo ${basename(h.kept[0].rel)} is only ${fmtDim(h.kept[0])}; pick another in the admin console`)
}

// Required fields and the 104 unique index (event, lower(email), lower(btrim(name))) on approved rows.
const uniq = new Map()
let residualChecked = 0
for (const h of honorees) {
  if (!h.honoree_name.trim()) problems.push(`${h.source}: empty honoree name`)
  if (!h.tribute.trim()) problems.push(`${h.source}: empty tribute (the database refuses it)`)
  if (h.tribute.includes('\0') || h.honoree_name.includes('\0')) problems.push(`${h.source}: NUL character in text`)
  if (!isRealDate(h.date)) problems.push(`${h.source}: no original date`)
  for (const [field, text] of [['honoree name', h.honoree_name], ['tribute', h.tribute]]) {
    const hits = residualEncoding(text)
    if (hits.length) problems.push(`${h.source}: undecoded encoding in the ${field}: ${[...new Set(hits)].join(' ')}`)
    else residualChecked++
  }
  const k = `${h.event}|${h.submitter_email.toLowerCase()}|${h.honoree_name.trim().toLowerCase()}`
  if (uniq.has(k)) problems.push(`Unique-index collision (104): "${h.honoree_name}" on ${h.event} with email "${h.submitter_email}" is both ${uniq.get(k)} and ${h.source}. The seed would fail midway.`)
  else uniq.set(k, h.source)
}
// The same photo in two different entries is fine (each entry owns its folder); listed for Ryan.
const byHash = new Map()
for (const h of honorees) for (const p of h.kept) { if (!byHash.has(p.sha)) byHash.set(p.sha, []); byHash.get(p.sha).push(`${h.honoree_name}: ${basename(p.rel)}`) }
for (const list of byHash.values()) if (list.length > 1) info.push(`Same photo bytes in more than one entry (each keeps its own copy): ${list.join(' | ')}`)

// ── report ──────────────────────────────────────────────────
const counts = {
  gf: honorees.filter(h => h.gfId).length,
  ...Object.fromEntries(PAGES.map(p => [p.label, honorees.filter(h => h.pagePostId === p.postId).length])),
  total: honorees.length,
  photosKept: honorees.reduce((n, h) => n + h.kept.length, 0),
  photosSkipped: honorees.reduce((n, h) => n + h.skipped.length, 0),
  overCap: honorees.filter(h => h.kept.length > WALL_PHOTO_CAP).length,
}
const fmtKB = b => `${Math.round(b / 1024)} KB`
const lines = []
const L = s => lines.push(s)
L(`# Wall of Honor WordPress import report`)
L('')
L(`Mode: ${APPLY ? '--apply' : '--dry-run (nothing uploaded, no seed written)'}. Generated ${new Date().toISOString()}.`)
L('')
L('## Read first: the two 2025 pages were SWAPPED from the original mapping')
L('')
L('The first plan said ' + Object.entries(BRIEF_MAPPING).map(([id, ev]) => `page ${id} = ${ev}`).join(' and ') + '. The WordPress data says the opposite, so this import uses:')
L('')
for (const s of pages.summaries) {
  L(`- **Page ${s.postId} -> ${s.event}** (${s.honorees} honorees). Its parent page in the WordPress menu is "${s.parentTitle}", and its photos were uploaded in ${s.majorityMonth} (${s.monthCounts}), the month of that event.`)
}
L('')
L('What happened on WordPress: the page created in April 2025 (48157) was rewritten in September 2025 for the West wall, and the page created in September 2025 (48512) holds the April East wall. That is also why the pages\' own creation dates do not fit their content, so each 2025 honoree\'s date is the date their photos were uploaded (see each entry). The script checks both signals on every run and stops if either ever disagrees. If this is wrong, say so before running --apply.')
L('')
L('## Summary')
L('')
L(`- Rows to import: **${counts.total}** = GF form 81: ${counts.gf}, ${PAGES.map(p => `${p.label} page: ${counts[p.label]}`).join(', ')}`)
L(`- GF form 81 entries in the dump: ${gf.sourceSummary.total}; skipped by ruling: ${gf.sourceSummary.skipped.length}; not active: ${gf.sourceSummary.inactive.length}${gf.sourceSummary.inactive.length ? ` (${gf.sourceSummary.inactive.join(', ')})` : ''}`)
L(`- Photos copied: ${counts.photosKept}; photo references skipped: ${counts.photosSkipped}; entries with more than ${WALL_PHOTO_CAP} photos (the admin picker chooses the wall ${WALL_PHOTO_CAP}): ${counts.overCap}`)
L(`- Every row: status approved, unpublished, imported_at = the seed's now(), consent_social false, consent_at = submitted_at = the original date (form rows: the form's submission time; 2025 page rows: the earliest upload date of the honoree's own photos), branch and unknown submitter fields '' (Ryan fills branch before publishing), photo_paths = the first photo only.`)
L(`- Blocking problems: **${problems.length}** (--apply refuses while any exist). Warnings: ${warnings.length}.`)
L('')
if (problems.length) { L('## BLOCKING PROBLEMS'); L(''); problems.forEach(p => L(`- ${p}`)); L('') }
if (warnings.length) { L('## Warnings'); L(''); warnings.forEach(p => L(`- ${p}`)); L('') }
L('## Flags and rulings')
L('')
L(`- **Perry pair (both imported, ruling):** "${perryPage[0].honoree_name}" from the ${perryPage[0].pageLabel} page (${perryPage[0].event}) and "${perryGf.honoree_name}" from GF #${PERRY.gfId} (${perryGf.event}). Both rows say so in admin_notes. Decide in the admin console whether both go on the wall.`)
const mikos = honorees.find(h => h.gfId === GF_FOLD.into)
L(`- **Mikos (ruling):** GF #${GF_FOLD.skip} is not its own row. Added to #${GF_FOLD.into}'s folder: ${mikos.kept.filter(p => p.foldedFrom).map(p => basename(p.rel)).join(', ') || 'none'}. Not added (byte-identical to a photo already there): ${mikos.skipped.filter(s => /34920/.test(s.from)).map(s => `${basename(s.file)} (${s.reason})`).join(', ') || 'none'}.`)
gf.sourceSummary.skipped.forEach(s => L(`- GF skipped: ${s}`))
L(`- GF #${GF_NO_EMAIL}: submitter_email '' (ruling; no publish email is ever sent for imported rows).`)
info.forEach(s => L(`- ${s}`))
L('')
L('## The 2025 pages')
L('')
for (const s of pages.summaries) {
  const dates = s.attachmentDates.sort()
  L(`### Post ${s.postId}: "${s.title}" -> ${s.event} (ruling; the original plan said ${BRIEF_MAPPING[s.postId]})`)
  L('')
  L(`- Event check: PASS. Parent page "${s.parentTitle}" names ${s.expectParent}; attachment months ${s.monthCounts}, majority ${s.majorityMonth} = expected ${s.expectMonth}.`)
  L(`- Page post_date ${s.postDate} UTC, last modified ${s.modified} UTC (NOT used as a date: it contradicts the content)`)
  L(`- Its photos were uploaded ${dates.length ? `${dates[0]} to ${dates.at(-1)} UTC` : '(no dated attachments)'}`)
  L(`- Honorees: ${s.honorees}. Columns without a heading (not imported): ${s.columnsWithoutHeading.join('; ') || 'none'}`)
  if (s.usedElsewhere.length) {
    const other = pages.summaries.find(o => o.postId !== s.postId)
    L(`- ${s.usedElsewhere.length} photos first uploaded to THIS page are now used on post ${other.postId} (attachments ${s.usedElsewhere.join(', ')}): evidence for the page-to-event check above`)
  }
  L(`- Attachments uploaded to this page and used on neither wall page (not imported): ${s.unreferenced.join('; ') || 'none'}`)
  L('')
}
L(`## Residual-encoding check`)
L('')
L(`- ${residualChecked === honorees.length * 2 ? 'PASS' : 'FAIL'}: ${residualChecked} of ${honorees.length * 2} names and tributes carry no undecoded HTML entity or WPBakery backtick encoding.`)
L('')
L('## Variant-filter self-check')
L('')
selfCheck.forEach(c => L(`- ${c.ok ? 'PASS' : 'FAIL'}: ${c.label}`))
L('')
L('## Entries')
L('')
for (const [i, h] of honorees.entries()) {
  L(`### ${i + 1}. ${h.honoree_name}`)
  L('')
  L(`- Source: ${h.source}; event: ${h.event}; date (submitted_at = consent_at): ${h.date} UTC, from ${h.dateSource ?? 'the form entry\'s date_created'}`)
  L(`- Submitter email: ${h.submitter_email ? h.submitter_email : "'' (none)"}; name, relationship, branch: ''`)
  if (h.lifeYears) L(`- Life years (to admin_notes, not service_years): ${h.lifeYears}`)
  L(`- Tribute: ${h.tribute.length} chars${h.tribute.length > 1500 ? ' (over the form\'s 1500 cap; imported in full)' : ''}${h.markupStripped ? '; page HTML markup removed, words unchanged' : ''}. Starts: "${h.tribute.slice(0, 120).replace(/\s+/g, ' ')}..."`)
  L(`- admin_notes: ${h.admin_notes.replace(/\n/g, ' / ')}`)
  L(`- Photos copied (${h.kept.length})${h.kept.length > WALL_PHOTO_CAP ? `, over the wall cap of ${WALL_PHOTO_CAP}: pick in the admin console` : ''}:`)
  if (!h.kept.length) L('  - none')
  h.kept.forEach((p, k) => L(`  - ${String(k).padStart(2, '0')}${k === 0 ? ' MAIN (photo_paths)' : ''}: ${p.rel} | ${p.type?.mime ?? 'UNSUPPORTED'} ${fmtDim(p)} ${p.quality} ${fmtKB(p.bytes)} | from ${p.from}${p.keptVariant ? ' | a size variant kept: its original is not on disk' : ''}${APPLY ? ` | -> ${p.path}` : ''}`))
  L(`- Skipped (${h.skipped.length}):`)
  if (!h.skipped.length) L('  - none')
  h.skipped.forEach(s => L(`  - ${s.file} | from ${s.from} | ${s.reason}`))
  if (h.diskVariants.length) L(`- WordPress size variants beside the originals on disk, not copied (${h.diskVariants.length}): ${h.diskVariants.join(', ')}`)
  L('')
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'report.md'), lines.join('\n'))

console.log(`Rows: ${counts.total} (GF ${counts.gf}, ${PAGES.map(p => `${p.label} ${counts[p.label]}`).join(', ')}); photos copied ${counts.photosKept}, skipped ${counts.photosSkipped}; over the 3-photo cap: ${counts.overCap}`)
console.log(`Blocking problems: ${problems.length}; warnings: ${warnings.length}`)
problems.forEach(p => console.log(`  PROBLEM  ${p}`))
warnings.forEach(p => console.log(`  warning  ${p}`))
console.log(`Report: ${join(OUT, 'report.md')}`)

if (!APPLY) { console.log('Dry run: nothing uploaded, no seed written. Review the report, then re-run with --apply.'); process.exit(0) }

// ── --apply ─────────────────────────────────────────────────
if (problems.length) { console.error('Refusing --apply: fix the blocking problems in the report first.'); process.exit(2) }
if (existsSync(SEED_PATH) || existsSync(TEARDOWN_PATH)) {
  console.error('Refusing --apply: a previous run\'s seed or teardown is still in supabase/seeds/. Its photos may already be uploaded: run that teardown (rows and storage) or keep that run, then delete both files to start over.')
  process.exit(2)
}
if (existsSync(join(ROOT, '.env.local'))) for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SRK) { console.error('Refusing --apply: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (.env.local).'); process.exit(2) }
const svc = { apikey: SRK, Authorization: `Bearer ${SRK}` }

// Preflight: migration 106's three events exist exactly once each, and no import ran before.
{
  const r = await fetch(`${URL_}/rest/v1/events?select=id,name&name=in.(${EVENT_NAMES.map(n => `"${n}"`).join(',')})`, { headers: svc })
  const evs = r.ok ? await r.json() : []
  for (const n of EVENT_NAMES) if (evs.filter(e => e.name === n).length !== 1) { console.error(`Refusing --apply: event "${n}" is not there exactly once (apply migration 106 first). Nothing uploaded.`); process.exit(2) }
  const r2 = await fetch(`${URL_}/rest/v1/wall_of_honor_entries?select=id&imported_at=not.is.null&limit=1`, { headers: svc })
  if (!r2.ok) { console.error(`Refusing --apply: cannot read wall_of_honor_entries (${r2.status}; is migration 105 applied?). Nothing uploaded.`); process.exit(2) }
  if ((await r2.json()).length) { console.error('Refusing --apply: imported rows already exist. Run the earlier teardown first. Nothing uploaded.'); process.exit(2) }
}

const q = s => `'${String(s).replace(/'/g, "''")}'`
const ts = d => q(`${d}+00`)
const allPaths = honorees.flatMap(h => h.kept.map(p => p.path))
const idList = honorees.map(h => `  ${q(h.id)}`).join(',\n')
const stamp = new Date().toISOString()

// The teardown is written BEFORE any upload, so a run that stops halfway can still be cleaned up.
writeFileSync(TEARDOWN_PATH, `-- Wall of Honor WordPress import: TEARDOWN (generated ${stamp} by scripts/import-woh-wordpress.mjs).
-- Git-ignored. Undoes exactly the run whose seed was generated with it.
--
-- 1. Unpublish any of these entries in /admin/wall-of-honor first (that removes their public copies).
-- 2. Run this file in a direct SQL session. It deletes the ${honorees.length} rows by id and fails
--    loudly unless every one of them was there.
-- 3. Remove the uploaded photos from the private bucket (SQL must never write storage tables):
--    node scripts/remove-storage-object.mjs ${BUCKET} <path> --delete
--    for each path below (each entry's folder is its id).
--
-- Storage paths (${BUCKET}, ${allPaths.length} objects):
${allPaths.map(p => `--   ${p}`).join('\n')}

begin;
do $$
declare v_n int;
begin
  delete from public.wall_of_honor_entries where id in (
${idList}
  );
  get diagnostics v_n = row_count;
  if v_n <> ${honorees.length} then
    raise exception 'woh import teardown: expected to delete ${honorees.length} rows, found %. Nothing deleted.', v_n;
  end if;
end $$;
commit;
`)

let uploaded = 0
for (const h of honorees) {
  for (const p of h.kept) {
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${p.path}`, {
      method: 'POST', headers: { ...svc, 'Content-Type': p.type.mime, 'x-upsert': 'false' }, body: readFileSync(join(UPLOADS, p.rel)),
    })
    if (!r.ok) {
      console.error(`Upload failed for ${p.path} (${r.status} ${(await r.text()).slice(0, 120)}). ${uploaded} of ${allPaths.length} uploaded. No seed written; the teardown lists every planned path: remove the uploaded ones, delete the teardown file, re-run.`)
      process.exit(3)
    }
    uploaded++
  }
}
console.log(`Uploaded ${uploaded} photos to ${BUCKET}.`)

const insertCols = 'id, event_id, status, is_published, imported_at, submitted_at, consent_at, consent_social, honoree_name, branch, tribute, photo_paths, submitter_name, submitter_relationship, submitter_email, admin_notes'
const inserts = honorees.map(h => `-- ${h.source}
insert into public.wall_of_honor_entries (${insertCols}) values (
  ${q(h.id)},
  (select id from public.events where name = ${q(h.event)}),
  'approved', false, now(), ${ts(h.date)}, ${ts(h.date)}, false,
  ${q(h.honoree_name)},
  '',
  ${q(h.tribute)},
  ${h.photo_paths.length ? `array[${h.photo_paths.map(q).join(', ')}]::text[]` : `'{}'::text[]`},
  '', '', ${q(h.submitter_email)},
  ${q(h.admin_notes)}
);`).join('\n\n')

writeFileSync(SEED_PATH, `-- Wall of Honor WordPress import: SEED (generated ${stamp} by scripts/import-woh-wordpress.mjs).
-- Git-ignored: it holds family tributes and emails. ${honorees.length} rows, ${allPaths.length} photos already
-- uploaded to ${BUCKET} by the same run. See supabase/seeds/woh_wordpress_import_README.md.
--
-- RUN IT IN A DIRECT SQL SESSION (the Supabase SQL editor or psql as postgres): auth.uid() is
-- null there, which is what makes aatc.woh_import trusted by wall_of_honor_guard (104) so the
-- original consent_at survives. A signed-in session would overwrite it; the check at the end
-- catches that and rolls everything back.
--
-- NOT RE-RUNNABLE, ON PURPOSE: the ids are fixed, so a second run aborts on the primary key
-- (duplicate key value violates unique constraint) and inserts nothing. It never doubles the wall.
-- To undo: supabase/seeds/woh_wordpress_import_teardown.sql.

begin;
select set_config('aatc.woh_import', 'on', false);

-- A missing event aborts the whole transaction loudly here. Backstop: each insert reads
-- event_id with a scalar subquery on the exact name, so a missing event would be a NOT NULL
-- violation on event_id, and a duplicated name a "more than one row" error.
do $$
begin
  if (select count(*) from public.events where name in (${EVENT_NAMES.map(q).join(', ')})) <> 3 then
    raise exception 'woh import: the events ${EVENT_NAMES.join(', ')} must each exist exactly once (migration 106). Nothing inserted.';
  end if;
end $$;

${inserts}

-- Every row kept its original consent date (the guard trusted the import), and all ${honorees.length} are there.
do $$
declare v_n int; v_bad int;
begin
  select count(*), count(*) filter (where consent_at <> submitted_at)
    into v_n, v_bad
    from public.wall_of_honor_entries
   where id in (
${idList}
   );
  if v_n <> ${honorees.length} then raise exception 'woh import: expected ${honorees.length} rows, found %', v_n; end if;
  if v_bad > 0 then
    raise exception 'woh import: % rows got the database clock as consent_at. Run this in a direct SQL session (auth.uid() null). Rolled back.', v_bad;
  end if;
end $$;

select set_config('aatc.woh_import', 'off', false);
commit;
`)
console.log(`Wrote ${SEED_PATH}\nWrote ${TEARDOWN_PATH}\nNext: review the report, then run the seed in a direct SQL session (README).`)
