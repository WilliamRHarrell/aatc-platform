#!/usr/bin/env node
/**
 * Live check that a signed-in NON-ADMIN exhibitor can do what /portal/graphics
 * does: upload to exhibitor-media/aatc-graphics/<own uid>/ and insert their own
 * aatc_submissions row - and CANNOT write into another user's folder.
 *
 *   node scripts/verify-graphics-owner.mjs
 *
 * Creates a temporary auth user (no email is sent), signs in with a password,
 * runs the three steps with that user's JWT, then deletes the object, the row
 * and the user. Exit 0 = all three outcomes as expected. Before migration 078
 * the own-folder upload FAILS with 42501 - that is the 2026-09-25 bug.
 */
import { readFileSync, existsSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
const svc = { apikey: SRK, Authorization: `Bearer ${SRK}` }
const email = `zz-graphics-${Date.now()}@example.com`, password = 'Zz-' + Math.random().toString(36).slice(2) + 'A1!'
let uid = null, failures = 0
const step = (label, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failures++ }
try {
  let r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) })
  if (r.status !== 200) throw new Error(`createUser ${r.status}`)
  uid = (await r.json()).id
  r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const jwt = (await r.json()).access_token
  const asUser = { apikey: ANON, Authorization: `Bearer ${jwt}` }

  // 1. own-folder upload (what the graphics page does)
  const own = `aatc-graphics/${uid}/${Date.now()}-verify.jpg`
  r = await fetch(`${URL_}/storage/v1/object/exhibitor-media/${own}`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) })
  let body = await r.text()
  step('exhibitor uploads to their OWN aatc-graphics folder', r.status === 200, `${r.status} ${body.slice(0, 90)}`)

  // 2. another user's folder must be refused
  const other = `aatc-graphics/00000000-0000-0000-0000-000000000000/${Date.now()}-verify.jpg`
  r = await fetch(`${URL_}/storage/v1/object/exhibitor-media/${other}`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'image/jpeg' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) })
  body = await r.text()
  step('exhibitor CANNOT upload into another user\'s folder', r.status === 400 || r.status === 403, `${r.status} ${body.slice(0, 90)}`)
  if (r.status === 200) await fetch(`${URL_}/storage/v1/object/exhibitor-media`, { method: 'DELETE', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [other] }) })

  // 3. own aatc_submissions row
  r = await fetch(`${URL_}/rest/v1/aatc_submissions`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ exhibitor_id: uid, artist_name: 'ZZ VERIFY GRAPHICS', instagram_handle: 'zz', square_paths: [own], vertical_paths: [], caption: 'zz', status: 'submitted' }) })
  body = await r.text()
  step('exhibitor inserts their OWN aatc_submissions row', r.status === 201, `${r.status} ${body.slice(0, 90)}`)
  // 4. not someone else's
  r = await fetch(`${URL_}/rest/v1/aatc_submissions`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'application/json' }, body: JSON.stringify({ exhibitor_id: '00000000-0000-0000-0000-000000000000', artist_name: 'ZZ VERIFY GRAPHICS', instagram_handle: 'zz', square_paths: [], vertical_paths: [], caption: 'zz' }) })
  body = await r.text()
  step('exhibitor CANNOT insert a row for another exhibitor_id', r.status === 401 || r.status === 403 || r.status === 409, `${r.status} ${body.slice(0, 90)}`)
} finally {
  if (uid) {
    await fetch(`${URL_}/storage/v1/object/exhibitor-media`, { method: 'DELETE', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [`aatc-graphics/${uid}`] }) }).catch(() => {})
    const list = await (await fetch(`${URL_}/storage/v1/object/list/exhibitor-media`, { method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: `aatc-graphics/${uid}`, limit: 10 }) })).json()
    for (const o of list ?? []) await fetch(`${URL_}/storage/v1/object/exhibitor-media/aatc-graphics/${uid}/${o.name}`, { method: 'DELETE', headers: svc })
    await fetch(`${URL_}/rest/v1/aatc_submissions?exhibitor_id=eq.${uid}`, { method: 'DELETE', headers: svc })
    const d = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: svc })
    console.log(`teardown: user ${d.status}, objects and rows removed`)
  }
}
process.exit(failures ? 1 : 0)
