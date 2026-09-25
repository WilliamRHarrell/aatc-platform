#!/usr/bin/env node
/**
 * Remove ONE object from a storage bucket with the service role.
 *   node scripts/remove-storage-object.mjs <bucket> <path>            # shows the object, deletes nothing
 *   node scripts/remove-storage-object.mjs <bucket> <path> --delete   # removes it
 * SQL cannot do this cleanly: deleting from storage.objects orphans the file.
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
const [bucket, path] = process.argv.slice(2)
const DELETE = process.argv.includes('--delete')
if (!bucket || !path) { console.error('usage: remove-storage-object.mjs <bucket> <path> [--delete]'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const name = path.slice(path.lastIndexOf('/') + 1)
const { data, error } = await sb.storage.from(bucket).list(folder, { search: name, limit: 10 })
if (error) { console.error(`list failed: ${error.message}`); process.exit(2) }
const obj = (data ?? []).find(o => o.name === name)
if (!obj) { console.error(`NOT FOUND: ${bucket}/${path}`); process.exit(3) }
console.log(`${bucket}/${path}  ${obj.metadata?.size ?? '?'} bytes  created ${obj.created_at}`)
if (!DELETE) { console.log('DRY RUN - nothing removed. Re-run with --delete.'); process.exit(0) }
const { data: removed, error: rmErr } = await sb.storage.from(bucket).remove([path])
if (rmErr) { console.error(`remove failed: ${rmErr.message}`); process.exit(4) }
console.log(removed?.length ? `removed ${path}` : `NOT removed (empty response) - check the dashboard`)
