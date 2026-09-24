#!/usr/bin/env node
/**
 * Orphan cleanup for the PRIVATE application-docs bucket.
 *
 *   node scripts/cleanup-application-docs-orphans.mjs            # DRY RUN (default)
 *   node scripts/cleanup-application-docs-orphans.mjs --delete   # actually delete
 *   options: --days N (default 7)   --allow-empty-applications
 *
 * A file is a candidate only when BOTH hold:
 *   1. no applications row references it (id_doc_url, veteran_id_url,
 *      artists[].id_url; legacy full URLs are normalised to object paths), and
 *   2. it was uploaded more than --days days ago (default 7), so a file whose
 *      row is still being written is never touched.
 *
 * Positive controls: the applications read is paged and checked against an
 * exact count, and the script ABORTS on an error, on a count mismatch (a
 * truncated read would make every file past the cut look unreferenced), and
 * on ZERO rows unless --allow-empty-applications is passed. It also refuses
 * to delete more than half the bucket in one run.
 *
 * Every candidate is printed with path, size, upload date and reason. Deletes
 * use the service role (nobody else holds DELETE on this bucket, migration
 * 071) and are reported per path with a final count. This is retention step 3
 * in HANDOFF; steps 1-2 (post-event and post-rejection deletion) are not built.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svcKey) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const args = process.argv.slice(2)
const DELETE = args.includes('--delete')
const ALLOW_EMPTY = args.includes('--allow-empty-applications')
const daysIdx = args.indexOf('--days')
const DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 7
if (!Number.isFinite(DAYS) || DAYS < 0) { console.error('--days must be a non-negative number'); process.exit(1) }

const BUCKET = 'application-docs'
const MARKER = `/${BUCKET}/`
const normalize = raw => { const i = raw.indexOf(MARKER); return i >= 0 ? raw.slice(i + MARKER.length) : raw }
const sb = createClient(url, svcKey)

async function walk(prefix) {
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`)
  const out = []
  for (const e of data) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if (e.id === null || !e.metadata) out.push(...await walk(path))
    else out.push({ path, size: e.metadata.size ?? null, created_at: e.created_at })
  }
  return out
}

// Paged, because PostgREST caps a single read (1000 rows by default) and returns
// the first page with error: null. The exact count is the control.
const PAGE = 500
const apps = []
let expected = null
for (let from = 0; ; from += PAGE) {
  const { data, error, count } = await sb.from('applications')
    .select('id, business_name, id_doc_url, veteran_id_url, artists', { count: 'exact' })
    .order('id').range(from, from + PAGE - 1)
  if (error) { console.error(`ABORT: applications read failed: ${error.message}`); process.exit(2) }
  if (expected === null) expected = count
  apps.push(...(data ?? []))
  if (!data || data.length < PAGE) break
}
if (expected === null || apps.length !== expected) {
  console.error(`ABORT: applications read returned ${apps.length} rows but the exact count is ${expected}`)
  process.exit(2)
}
if (apps.length === 0 && !ALLOW_EMPTY) {
  console.error('ABORT: applications returned 0 rows. If that is truly the state, re-run with --allow-empty-applications.')
  process.exit(2)
}
const refs = new Map()
for (const a of apps) {
  const add = p => { if (p) refs.set(normalize(p), a) }
  add(a.id_doc_url); add(a.veteran_id_url)
  for (const ar of Array.isArray(a.artists) ? a.artists : []) add(ar?.id_url)
}

const files = await walk('')
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000
const candidates = []
let referenced = 0, tooNew = 0
for (const f of files.sort((a, b) => a.path.localeCompare(b.path))) {
  const ref = refs.get(f.path)
  if (ref) { referenced++; continue }
  if (new Date(f.created_at).getTime() > cutoff) { tooNew++; continue }
  candidates.push(f)
}

console.log(`${DELETE ? 'DELETE RUN' : 'DRY RUN'} - bucket ${BUCKET}: ${files.length} files, ${apps.length} application rows, ${refs.size} referenced paths`)
console.log(`referenced: ${referenced}   unreferenced but newer than ${DAYS} days (kept): ${tooNew}   candidates: ${candidates.length}`)
console.log('path | size | uploaded | reason')
for (const f of candidates) console.log(`${f.path} | ${f.size} | ${f.created_at.slice(0, 10)} | unreferenced, older than ${DAYS} days`)

if (!DELETE) {
  console.log(`DRY RUN - nothing deleted. Re-run with --delete to remove the ${candidates.length} file(s) above.`)
  process.exit(0)
}
if (candidates.length > files.length / 2 && !args.includes('--allow-mass-delete')) {
  console.error(`ABORT: ${candidates.length} of ${files.length} files are candidates (more than half). Re-run with --allow-mass-delete if that is really the state.`)
  process.exit(2)
}

let deleted = 0, failed = 0
for (let i = 0; i < candidates.length; i += 50) {
  const batch = candidates.slice(i, i + 50).map(f => f.path)
  const { data, error } = await sb.storage.from(BUCKET).remove(batch)
  if (error) { failed += batch.length; console.error(`FAILED batch ${i / 50 + 1}: ${error.message}`); continue }
  const removed = new Set((data ?? []).map(o => o.name))
  for (const p of batch) {
    if (removed.has(p)) { deleted++; console.log(`deleted ${p}`) }
    else { failed++; console.error(`NOT deleted (not in response): ${p}`) }
  }
}
console.log(`done: deleted ${deleted}, failed ${failed}, of ${candidates.length} candidates`)
process.exit(failed ? 3 : 0)
