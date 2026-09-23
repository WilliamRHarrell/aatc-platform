#!/usr/bin/env node
/**
 * Tattoo Battle RLS check, from the outside, with the ANON key.
 *
 *   node scripts/verify-tattoo-battle-anon.mjs
 *
 * Asserts what a phone scanning a bucket can and cannot do:
 *   - a published entry is readable; a draft is not (positive control via service role)
 *   - anon cannot insert, update or delete an entry
 *   - anon cannot upload to tattoo-battle-media, and cannot LIST it (editors only)
 * "anon cannot see it" has two failure modes (zero rows, or 42501); both are
 * asserted as the OUTCOME, per HANDOFF. Needs SUPABASE_SERVICE_ROLE_KEY for
 * the control; without it the draft/published assertions are SKIPPED, not passed.
 *
 * Safe to run any time: the anon key can only read; the service-role part
 * creates two fixture rows (bucket 9001/9002 on the ACTIVE event) and removes
 * them. Before migration 069 is applied every table check reports SKIP.
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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey) { console.error('Missing Supabase env'); process.exit(1) }
const anon = createClient(url, anonKey)
const svc = svcKey ? createClient(url, svcKey) : null

const results = []
let failed = 0
const pass = (name, detail) => results.push({ s: 'PASS', name, detail })
const fail = (name, detail) => { failed++; results.push({ s: 'FAIL', name, detail }) }
const skip = (name, detail) => results.push({ s: 'SKIP', name, detail })
const refused = (res) => res.error?.code === '42501' || (!res.error && (res.data ?? []).length === 0)

const { data: event } = await anon.from('events').select('id').eq('is_active', true).single()
if (!event) { console.error('No active event readable as anon'); process.exit(1) }

// PostgREST reports a missing table as PGRST205 (schema cache), Postgres as 42P01.
const probe = await anon.from('tattoo_battle_entries').select('id').limit(1)
if (probe.error?.code === '42P01' || probe.error?.code === 'PGRST205') {
  skip('table exists', `migration 069 not applied yet (${probe.error.code}) - every table check skipped`)
} else if (probe.error) {
  fail('anon select on tattoo_battle_entries', `${probe.error.code} ${probe.error.message}`)
} else {
  const ins = await anon.from('tattoo_battle_entries').insert({ event_id: event.id, bucket_number: 9002 }).select('id')
  if (refused(ins)) pass('anon insert refused', ins.error?.code ?? '0 rows')
  else fail('anon insert refused', ins.error ? `${ins.error.code} ${ins.error.message}` : `INSERTED ${ins.data.length} row(s)`)

  const rpc = await anon.rpc('set_tattoo_battle_champion', { p_entry_id: null })
  if (rpc.error && (rpc.error.code === '42501' || /permission denied/i.test(rpc.error.message))) pass('anon cannot call champion RPC', rpc.error.code)
  else fail('anon cannot call champion RPC', rpc.error ? `${rpc.error.code} ${rpc.error.message}` : 'RAN')

  if (svc) {
    await svc.from('tattoo_battle_entries').delete().eq('event_id', event.id).gte('bucket_number', 9001)
    const { error: fxErr } = await svc.from('tattoo_battle_entries').insert([
      { event_id: event.id, bucket_number: 9001, artist_name: 'ZZ Draft', media: [], is_published: false },
      { event_id: event.id, bucket_number: 9002, artist_name: 'ZZ Published', media: [{ type: 'image', path: 'zz/x.jpg' }], is_published: true },
    ])
    if (fxErr) fail('fixture insert (service role)', `${fxErr.code} ${fxErr.message}`)
    else {
      const ctrl = await svc.from('tattoo_battle_entries').select('bucket_number').eq('event_id', event.id).gte('bucket_number', 9001)
      if ((ctrl.data ?? []).length !== 2) fail('control: fixtures visible to service role', `${(ctrl.data ?? []).length} rows`)
      else pass('control: fixtures visible to service role', '2 rows')

      const draft = await anon.from('tattoo_battle_entries').select('id').eq('event_id', event.id).eq('bucket_number', 9001)
      if (draft.error) fail('anon cannot see draft', `${draft.error.code}`)
      else if (draft.data.length === 0) pass('anon cannot see draft', '0 rows')
      else fail('anon cannot see draft', `${draft.data.length} row(s) LEAKED`)

      const pub = await anon.from('tattoo_battle_entries').select('id, artist_name').eq('event_id', event.id).eq('bucket_number', 9002)
      if (!pub.error && pub.data.length === 1) pass('anon sees published', pub.data[0].artist_name)
      else fail('anon sees published', pub.error ? pub.error.code : `${pub.data.length} rows`)

      const upd = await anon.from('tattoo_battle_entries').update({ artist_name: 'hacked' }).eq('event_id', event.id).eq('bucket_number', 9002).select('id')
      if (refused(upd)) pass('anon update refused', upd.error?.code ?? '0 rows')
      else fail('anon update refused', `${upd.data?.length} row(s) updated`)

      const del = await anon.from('tattoo_battle_entries').delete().eq('event_id', event.id).eq('bucket_number', 9002).select('id')
      if (refused(del)) pass('anon delete refused', del.error?.code ?? '0 rows')
      else fail('anon delete refused', `${del.data?.length} row(s) deleted`)

      await svc.from('tattoo_battle_entries').delete().eq('event_id', event.id).gte('bucket_number', 9001)
      const residue = await svc.from('tattoo_battle_entries').select('id').eq('event_id', event.id).gte('bucket_number', 9001)
      if ((residue.data ?? []).length === 0) pass('fixtures removed', '0 remaining'); else fail('fixtures removed', `${residue.data.length} remaining`)
    }
  } else {
    skip('draft/published visibility', 'SUPABASE_SERVICE_ROLE_KEY missing - no positive control, so not asserted')
  }
}

// ── storage as anon ──
// image/jpeg so the mime allow-list cannot be what refuses it: only RLS can.
const up = await anon.storage.from('tattoo-battle-media').upload(`zz-anon-${Date.now()}.jpg`, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]), { contentType: 'image/jpeg' })
if (up.error && /bucket not found/i.test(up.error.message)) skip('anon storage upload', 'bucket missing - migration 069 not applied')
else if (up.error) pass('anon storage upload refused', up.error.message)
else { fail('anon storage upload refused', `UPLOADED ${up.data.path}`); if (svc) await svc.storage.from('tattoo-battle-media').remove([up.data.path]) }
const ls = await anon.storage.from('tattoo-battle-media').list('', { limit: 1 })
const bucketMissing = (up.error && /bucket not found/i.test(up.error.message)) || (ls.error && /not found/i.test(ls.error.message))
if (bucketMissing) skip('anon storage list', 'bucket missing - migration 069 not applied')
else if (ls.error) pass('anon storage list refused', ls.error.message)
else if ((ls.data ?? []).length === 0 && svc) {
  // An empty list is ambiguous (refused vs. genuinely empty). Disambiguate with a control object.
  const key = `zz-control-${Date.now()}.jpg`
  const put = await svc.storage.from('tattoo-battle-media').upload(key, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]), { contentType: 'image/jpeg' })
  if (put.error) skip('anon storage list', `could not place a control object: ${put.error.message}`)
  else {
    const again = await anon.storage.from('tattoo-battle-media').list('', { limit: 10 })
    const seen = (again.data ?? []).some(o => o.name === key)
    if (seen) fail('anon storage list refused', 'anon can LIST the bucket (editors only expected)'); else pass('anon storage list refused', 'control object invisible to anon')
    await svc.storage.from('tattoo-battle-media').remove([key])
  }
} else if ((ls.data ?? []).length > 0) fail('anon storage list refused', `anon listed ${ls.data.length} object(s)`)
else skip('anon storage list', 'empty result and no service key to place a control object')

console.log('\nTATTOO BATTLE ANON CHECK\n' + '─'.repeat(72))
for (const r of results) console.log(`  ${r.s.padEnd(4)} ${r.name.padEnd(42)} ${r.detail}`)
console.log('')
process.exit(failed > 0 ? 1 : 0)
