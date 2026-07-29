#!/usr/bin/env node
/**
 * Post-migration check for migrations 027-030.
 *
 * Replays the EXACT query each public surface issues, using the ANON key. A
 * service-role run proves nothing here — service role bypasses RLS entirely,
 * which is the thing under test.
 *
 * The failure mode being guarded against is silent disappearance: a tightened
 * policy returns [] rather than an error, so "0 rows" is reported as a warning
 * to be reconciled against the service-role baseline printed at the end.
 *
 *   node scripts/verify-sponsor-visibility.mjs
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const anon = createClient(url, anonKey)
const svc = svcKey ? createClient(url, svcKey) : null

const { data: event } = await anon.from('events').select('id').eq('is_active', true).single()
if (!event) {
  console.error('No active event readable as anon — cannot verify.')
  process.exit(1)
}

let failed = 0
const results = []

async function surface(name, expectation, run) {
  const { data, error } = await run()
  if (error) {
    failed++
    results.push({ name, status: 'FAIL', detail: `${error.code} ${error.message}` })
    return
  }
  const n = Array.isArray(data) ? data.length : data ? 1 : 0
  results.push({ name, status: n > 0 ? 'OK' : 'EMPTY', detail: `${n} row(s) — ${expectation}` })
}

// ── Every non-admin read path, exactly as the app issues it ──
await surface('SiteFooter logos', 'featured_footer=true, confirmed', () =>
  anon.from('sponsorships')
    .select('id, sponsor_name, logo_url, website')
    .eq('featured_footer', true).eq('status', 'confirmed').limit(5))

await surface('Homepage grid', 'show_on_homepage=true, confirmed', () =>
  anon.from('sponsorships')
    .select('id, sponsor_name, tier, logo_url, website, homepage_order')
    .eq('event_id', event.id).eq('show_on_homepage', true).eq('status', 'confirmed'))

await surface('/sponsors directory', 'all confirmed sponsors', () =>
  anon.from('sponsorships')
    .select('id, sponsor_name, tier, logo_url, website, amount, instagram, facebook')
    .eq('event_id', event.id).eq('status', 'confirmed').order('amount', { ascending: false }))

await surface('/sponsors/packages sold-out', 'tier counts via RPC', () =>
  anon.rpc('sponsor_tier_counts', { p_event_id: event.id }))

// ── Negative check: pending rows must NOT be anon-readable ──
{
  const { data, error } = await anon.from('sponsorships').select('id, email').eq('status', 'pending')
  if (error) {
    results.push({ name: 'Pending rows hidden', status: 'OK', detail: `blocked (${error.code})` })
  } else if ((data ?? []).length > 0) {
    failed++
    results.push({ name: 'Pending rows hidden', status: 'FAIL', detail: `${data.length} pending row(s) readable by anon — baseline policy still present` })
  } else {
    results.push({ name: 'Pending rows hidden', status: 'OK', detail: '0 pending rows visible to anon' })
  }
}

// ── invoices must no longer recurse ──
{
  const { error } = await anon.from('invoices').select('id').limit(1)
  const recursing = error?.code === '42P17'
  if (recursing) failed++
  results.push({
    name: 'invoices RLS (no recursion)',
    status: recursing ? 'FAIL' : 'OK',
    detail: error ? `${error.code} ${error.message.slice(0, 60)}` : 'readable/denied without recursion',
  })
}

// ════════════════════════════════════════════════════════════
// REQUIRED PRE-PUSH ASSERTIONS (migrations 027–030)
// All three must pass. Each is asserted with the ANON key — a service-role
// run bypasses RLS entirely and would prove nothing about these.
// ════════════════════════════════════════════════════════════
const assertions = []
function assert(name, ok, detail) {
  if (!ok) failed++
  assertions.push({ name, status: ok ? 'PASS' : 'FAIL', detail })
}

// (1) A pending sponsorship must return zero rows to anon.
{
  const { data: pending } = svc
    ? await svc.from('sponsorships').select('id').eq('status', 'pending').limit(1)
    : { data: null }

  const { data, error } = await anon.from('sponsorships').select('id').eq('status', 'pending')
  const rows = (data ?? []).length
  const seeded = (pending ?? []).length > 0
  assert(
    'pending sponsorship -> 0 rows',
    !error && rows === 0,
    error
      ? `unexpected error ${error.code}`
      : rows > 0
        ? `${rows} pending row(s) LEAKED to anon`
        : seeded
          ? '0 rows (a pending row exists, correctly hidden)'
          : '0 rows — NOTE: no pending row exists to hide, assertion is vacuous',
  )
}

// (2) An approved, deposit-paid application must return rows, without 42P17.
{
  const { data, error } = await anon
    .from('applications')
    .select('id, business_name')
    .eq('status', 'approved')

  const { data: truth } = svc
    ? await svc.from('applications').select('id, needs_roster, status').eq('status', 'approved')
    : { data: null }

  const rows = (data ?? []).length
  const expected = truth ? truth.filter(a => a.needs_roster === false).length : null
  assert(
    'approved+deposit-paid app -> rows, no 42P17',
    !error && rows > 0,
    error
      ? `${error.code} ${error.message.slice(0, 50)}`
      : expected !== null
        ? `${rows} visible / ${expected} eligible by status+roster (deposit gate may reduce further)`
        : `${rows} visible`,
  )
}

// (3) A sponsor must be able to read their own invoice.
//
// Needs a real user-scoped session — anon cannot stand in, and service role
// bypasses the policy under test. The session is MINTED via the admin API
// (generateLink -> verifyOtp) rather than a password login, so no credential
// for the harness account is ever stored in an env file or the repo. Set
// VERIFY_SPONSOR_EMAIL to the throwaway harness account.
{
  const email = process.env.VERIFY_SPONSOR_EMAIL
  if (!email) {
    assert('sponsor reads own invoice', false, 'NOT RUN — set VERIFY_SPONSOR_EMAIL to the harness account')
  } else if (!svc) {
    assert('sponsor reads own invoice', false, 'NOT RUN — SUPABASE_SERVICE_ROLE_KEY needed to mint a session')
  } else {
    // Mint a one-time login token as the harness user. No password involved.
    const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkErr || !link?.properties?.hashed_token) {
      assert('sponsor reads own invoice', false, `could not mint session: ${linkErr?.message ?? 'no token returned'}`)
    } else {
      const user = createClient(url, anonKey)
      const { error: otpErr } = await user.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: 'email',
      })

      if (otpErr) {
        assert('sponsor reads own invoice', false, `session exchange failed: ${otpErr.message}`)
      } else {
        const { data: spon } = await user.from('sponsorships').select('id, status').limit(5)
        const { data: inv, error: invErr } = await user
          .from('invoices')
          .select('id, sponsorship_id, application_id')
          .not('sponsorship_id', 'is', null)

        assert(
          'sponsor reads own invoice',
          !invErr && (inv ?? []).length > 0,
          invErr
            ? `${invErr.code} ${invErr.message.slice(0, 50)}`
            : `${(inv ?? []).length} sponsorship invoice(s) readable; own sponsorships=${(spon ?? []).length}`,
        )
        await user.auth.signOut()
      }
    }
  }
}

const pad = s => s.padEnd(30)
console.log('\nANON-KEY SURFACE CHECK (migrations 027-030)\n' + '─'.repeat(72))
for (const r of results) {
  console.log(`  ${r.status === 'FAIL' ? 'FAIL ' : r.status === 'EMPTY' ? 'EMPTY' : 'OK   '} ${pad(r.name)} ${r.detail}`)
}

console.log('\nREQUIRED PRE-PUSH ASSERTIONS\n' + '─'.repeat(72))
for (const a of assertions) {
  console.log(`  ${a.status === 'FAIL' ? 'FAIL' : 'PASS'} ${pad(a.name)} ${a.detail}`)
}

if (svc) {
  const { data: all } = await svc
    .from('sponsorships')
    .select('status, featured_footer, show_on_homepage')
    .eq('event_id', event.id)
  const rows = all ?? []
  console.log('\nSERVICE-ROLE BASELINE (what SHOULD be visible)\n' + '─'.repeat(72))
  console.log(`  total=${rows.length}  confirmed=${rows.filter(r => r.status === 'confirmed').length}` +
    `  footer=${rows.filter(r => r.featured_footer).length}` +
    `  homepage=${rows.filter(r => r.show_on_homepage).length}`)
  console.log('  Reconcile any EMPTY above against these counts.')
}

console.log('')
process.exit(failed > 0 ? 1 : 0)
