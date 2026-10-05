#!/usr/bin/env node
/**
 * Live check, after migration 090, that a signed-in food-truck owner can do
 * what /portal does for their truck, through the real Storage API and RLS:
 *   - read their own truck's invoice, and not another truck's;
 *   - upload a logo into their own truck's folder (<truck id>/logo.png);
 *   - NOT upload into another truck's folder (before 090 any account could).
 *
 *   node scripts/verify-food-truck-owner.mjs
 *
 * Creates a temporary auth user (no email is sent), an inactive event
 * "ZZ VERIFY 090 LIVE (DELETE ME)" with two ZZ trucks and their invoices,
 * runs the checks with the user's JWT, then deletes every object, row and the
 * user. Exit 0 = every outcome as expected. Pattern: verify-graphics-owner.mjs.
 */
import { readFileSync, existsSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
const svc = { apikey: SRK, Authorization: `Bearer ${SRK}` }
const json = { 'Content-Type': 'application/json' }
const email = `zz-truck-${Date.now()}@example.com`, password = 'Zz-' + Math.random().toString(36).slice(2) + 'A1!'
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
let uid = null, eventId = null, own = null, other = null, failures = 0
const step = (label, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failures++ }
const rest = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, init)
try {
  let r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { ...svc, ...json }, body: JSON.stringify({ email, password, email_confirm: true }) })
  if (r.status !== 200) throw new Error(`createUser ${r.status}`)
  uid = (await r.json()).id
  r = await rest('events', { method: 'POST', headers: { ...svc, ...json, Prefer: 'return=representation' }, body: JSON.stringify({ name: 'ZZ VERIFY 090 LIVE (DELETE ME)', venue: 'ZZ', city: 'ZZ', state: 'ZZ', start_date: '2099-01-01', end_date: '2099-01-02', is_active: false }) })
  eventId = (await r.json())[0].id
  r = await rest('food_trucks', { method: 'POST', headers: { ...svc, ...json, Prefer: 'return=representation' }, body: JSON.stringify([
    { event_id: eventId, user_id: uid, business_name: 'ZZ VERIFY 090 OWN (DELETE ME)', contact_name: 'ZZ', email, days: ['friday'] },
    { event_id: eventId, user_id: null, business_name: 'ZZ VERIFY 090 OTHER (DELETE ME)', contact_name: 'ZZ', email: 'zz-090-other@example.com', days: ['friday'] },
  ]) })
  const trucks = await r.json(); own = trucks[0].id; other = trucks[1].id
  await rest('invoices', { method: 'POST', headers: { ...svc, ...json }, body: JSON.stringify([{ food_truck_id: own, amount: 10000, amount_paid: 0, status: 'pending' }, { food_truck_id: other, amount: 10000, amount_paid: 0, status: 'pending' }]) })

  r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, ...json }, body: JSON.stringify({ email, password }) })
  const asUser = { apikey: ANON, Authorization: `Bearer ${(await r.json()).access_token}` }

  r = await rest(`invoices?select=id&food_truck_id=eq.${own}`, { headers: asUser }); let rows = await r.json()
  step('owner reads their own truck invoice', Array.isArray(rows) && rows.length === 1, `${r.status} ${rows.length ?? ''}`)
  r = await rest(`invoices?select=id&food_truck_id=eq.${other}`, { headers: asUser }); rows = await r.json()
  step('owner CANNOT read another truck\'s invoice', Array.isArray(rows) && rows.length === 0, `${r.status} ${rows.length ?? ''}`)

  r = await fetch(`${URL_}/storage/v1/object/food-truck-logos/${own}/logo.png`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: PNG })
  step('owner uploads a logo into their own truck folder', r.status === 200, `${r.status} ${(await r.text()).slice(0, 90)}`)
  r = await fetch(`${URL_}/storage/v1/object/food-truck-logos/${other}/logo.png`, { method: 'POST', headers: { ...asUser, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: PNG })
  step('owner CANNOT upload into another truck\'s folder', r.status === 400 || r.status === 403, `${r.status} ${(await r.text()).slice(0, 90)}`)
} finally {
  for (const id of [own, other].filter(Boolean)) await fetch(`${URL_}/storage/v1/object/food-truck-logos`, { method: 'DELETE', headers: { ...svc, ...json }, body: JSON.stringify({ prefixes: [`${id}/logo.png`] }) }).catch(() => {})
  if (own || other) await rest(`invoices?food_truck_id=in.(${[own, other].filter(Boolean).join(',')})`, { method: 'DELETE', headers: svc })
  if (eventId) { await rest(`food_trucks?event_id=eq.${eventId}`, { method: 'DELETE', headers: svc }); await rest(`events?id=eq.${eventId}`, { method: 'DELETE', headers: svc }) }
  if (uid) { const d = await fetch(`${URL_}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: svc }); console.log(`teardown: user ${d.status}, trucks, invoices, event and logos removed`) }
  process.exit(failures ? 1 : 0)
}
