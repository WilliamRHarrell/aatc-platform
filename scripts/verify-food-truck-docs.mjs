#!/usr/bin/env node
/**
 * Live check, after migration 093, of the private food-truck-docs bucket
 * through the real Storage API and RLS, as a signed-in truck owner:
 *   - upload a PDF into their own truck's folder (what /portal does);
 *   - NOT upload into another truck's folder;
 *   - NOT read any document back, their own included (admin read only);
 *   - nothing is reachable by public URL or without a session;
 *   - the bucket refuses a type it does not allow (text/plain);
 *   - recording the path on their truck stamps it and leaves it unverified.
 *
 *   node scripts/verify-food-truck-docs.mjs
 *
 * Creates a temporary auth user (no email is sent), an inactive event
 * "ZZ VERIFY 093 LIVE (DELETE ME)" with two ZZ trucks, runs the checks with
 * the user's JWT, then deletes every object, row and the user. Exit 0 = every
 * outcome as expected. Pattern: verify-food-truck-owner.mjs (090).
 */
import { readFileSync, existsSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
const svc = { apikey: SRK, Authorization: `Bearer ${SRK}` }
const json = { 'Content-Type': 'application/json' }
const BUCKET = 'food-truck-docs'
const email = `zz-truckdocs-${Date.now()}@example.com`, password = 'Zz-' + Math.random().toString(36).slice(2) + 'A1!'
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
let uid = null, eventId = null, own = null, other = null, failures = 0
const uploaded = []
const step = (label, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failures++ }
const rest = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, init)
const put = (headers, path, body, type) => fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': type }, body })
try {
  let r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { ...svc, ...json }, body: JSON.stringify({ email, password, email_confirm: true }) })
  if (r.status !== 200) throw new Error(`createUser ${r.status}`)
  uid = (await r.json()).id
  r = await rest('events', { method: 'POST', headers: { ...svc, ...json, Prefer: 'return=representation' }, body: JSON.stringify({ name: 'ZZ VERIFY 093 LIVE (DELETE ME)', venue: 'ZZ', city: 'ZZ', state: 'ZZ', start_date: '2099-01-01', end_date: '2099-01-02', is_active: false }) })
  eventId = (await r.json())[0].id
  r = await rest('food_trucks', { method: 'POST', headers: { ...svc, ...json, Prefer: 'return=representation' }, body: JSON.stringify([
    { event_id: eventId, user_id: uid, business_name: 'ZZ VERIFY 093 OWN (DELETE ME)', contact_name: 'ZZ', email, days: ['friday'] },
    { event_id: eventId, user_id: null, business_name: 'ZZ VERIFY 093 OTHER (DELETE ME)', contact_name: 'ZZ', email: 'zz-093-other@example.com', days: ['friday'] },
  ]) })
  const trucks = await r.json(); own = trucks[0].id; other = trucks[1].id

  r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, ...json }, body: JSON.stringify({ email, password }) })
  const asUser = { apikey: ANON, Authorization: `Bearer ${(await r.json()).access_token}` }

  const ownPath = `${own}/permit-zz.pdf`
  r = await put(asUser, ownPath, PDF, 'application/pdf')
  if (r.status === 200) uploaded.push(ownPath)
  step('owner uploads a PDF into their own truck folder', r.status === 200, `${r.status} ${(await r.text()).slice(0, 90)}`)

  const otherPath = `${other}/permit-zz.pdf`
  r = await put(asUser, otherPath, PDF, 'application/pdf')
  if (r.status === 200) uploaded.push(otherPath)
  step('owner CANNOT upload into another truck\'s folder', r.status === 400 || r.status === 403, `${r.status} ${(await r.text()).slice(0, 90)}`)

  r = await put(asUser, `${own}/note-zz.txt`, Buffer.from('zz'), 'text/plain')
  if (r.status === 200) uploaded.push(`${own}/note-zz.txt`)
  step('the bucket refuses a type it does not allow (text/plain)', r.status >= 400, `${r.status} ${(await r.text()).slice(0, 90)}`)

  r = await fetch(`${URL_}/storage/v1/object/authenticated/${BUCKET}/${ownPath}`, { headers: asUser })
  step('owner CANNOT read their document back (admin read only)', r.status >= 400, `${r.status}`)
  r = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${ownPath}`)
  step('no public URL (the bucket is private)', r.status >= 400, `${r.status}`)
  r = await fetch(`${URL_}/storage/v1/object/authenticated/${BUCKET}/${ownPath}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  step('anon CANNOT read it', r.status >= 400, `${r.status}`)
  r = await fetch(`${URL_}/storage/v1/object/authenticated/${BUCKET}/${ownPath}`, { headers: svc })
  step('the file is really there (service read)', r.status === 200, `${r.status}`)

  r = await rest(`food_trucks?id=eq.${own}`, { method: 'PATCH', headers: { ...asUser, ...json, Prefer: 'return=representation' }, body: JSON.stringify({ permit_path: ownPath, permit_verified_at: new Date().toISOString() }) })
  const row = (await r.json())[0] ?? {}
  step('owner records the permit: stamped, and NOT verified by their own write', r.status === 200 && row.permit_path === ownPath && !!row.permit_uploaded_at && row.permit_verified_at === null,
    `${r.status} path=${row.permit_path} uploaded=${row.permit_uploaded_at} verified=${row.permit_verified_at}`)
} finally {
  if (uploaded.length) await fetch(`${URL_}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...svc, ...json }, body: JSON.stringify({ prefixes: uploaded }) }).catch(() => {})
  if (eventId) { await rest(`food_trucks?event_id=eq.${eventId}`, { method: 'DELETE', headers: svc }); await rest(`events?id=eq.${eventId}`, { method: 'DELETE', headers: svc }) }
  if (uid) { const d = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: svc }); console.log(`teardown: user ${d.status}, trucks, event and ${uploaded.length} file(s) removed`) }
  process.exit(failures ? 1 : 0)
}
