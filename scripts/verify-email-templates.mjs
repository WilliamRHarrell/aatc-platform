#!/usr/bin/env node
/**
 * Prove all nine transactional templates actually deliver.
 *
 * Every one has been failing since launch — the sandbox sender refused any
 * recipient but the account owner, and not one call site checked the response.
 * This is the gate before LIFECYCLE_SWEEP_ENABLED is ever set, because the
 * sweep releases booths on the assumption that its warnings arrived.
 *
 *   node scripts/verify-email-templates.mjs --to you@example.com [--base URL] [--keep]
 *
 * WHAT IT DOES
 *   1. Seeds a temporary application + invoice + sponsorship, owned by a
 *      throwaway auth user, with EVERY recipient address set to --to.
 *   2. Calls /api/send-email once per template, as the cron caller (x-cron-secret),
 *      and records the HTTP status and body.
 *   3. Tears the records down again unless --keep.
 *
 * WHY IT SEEDS RATHER THAN USING REAL ROWS
 *   The templates read live data — business name, booth description, amounts,
 *   due dates — so a dry run against fabricated payloads would prove the
 *   transport and not the template. Seeding exercises the real query path with
 *   data shaped like production, and redirects delivery to one inbox you watch.
 *
 * A PASS HERE MEANS: the API accepted it and Resend queued it. You must still
 * confirm each arrives — check the inbox, and check spam. The script prints a
 * checklist to tick off.
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

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, c, i, arr) => {
    if (c.startsWith('--')) a.push([c.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true])
    return a
  }, [])
)
const TO = args.to
const BASE = args.base ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const KEEP = !!args.keep

if (!TO || TO === true) {
  console.error('Usage: --to you@example.com [--base https://…] [--keep]')
  process.exit(1)
}
for (const v of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) {
  if (!process.env[v]) { console.error(`Missing ${v}`); process.exit(1) }
}

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const MARK = 'ZZ EMAIL TEST'

const { data: event } = await svc.from('events').select('id').eq('is_active', true).single()
if (!event) { console.error('No active event.'); process.exit(1) }

// ── seed ────────────────────────────────────────────────────
console.log(`Seeding test records (all recipients -> ${TO})…`)

const email = `email-harness+${Date.now()}@example.invalid`
const { data: created, error: userErr } = await svc.auth.admin.createUser({
  email, email_confirm: true,
})
if (userErr) { console.error('Could not create harness user:', userErr.message); process.exit(1) }
const userId = created.user.id

const soon = new Date(Date.now() + 7 * 86400000).toISOString()
const { data: app, error: appErr } = await svc.from('applications').insert({
  event_id: event.id, user_id: userId,
  business_name: `${MARK} Tattoo Co`, contact_name: 'Test Contact',
  email: TO, phone: '910-555-0100',
  exhibitor_type: 'artist', artist_single_qty: 1, artist_count: 2,
  total_amount: 90000, status: 'approved', needs_roster: false,
  deposit_due_at: soon, final_due_at: soon,
}).select('id').single()
if (appErr) { console.error('Application insert failed:', appErr.message); process.exit(1) }

const { data: inv } = await svc.from('invoices').insert({
  application_id: app.id, amount: 90000, amount_paid: 0, status: 'pending',
}).select('id').single()

const { data: spon } = await svc.from('sponsorships').insert({
  event_id: event.id, sponsor_name: `${MARK} Sponsor`, tier: 'gold',
  amount: 500000, status: 'confirmed', email: TO, contact_name: 'Test Sponsor',
}).select('id').single()

console.log(`  application ${app.id}\n  invoice     ${inv?.id}\n  sponsorship ${spon?.id}\n`)

// ── send ────────────────────────────────────────────────────
const CASES = [
  ['approved',         { applicationId: app.id, kind: 'approved' }],
  ['rejected',         { applicationId: app.id, kind: 'rejected' }],
  ['waitlisted',       { applicationId: app.id, kind: 'waitlisted' }],
  ['deposit_reminder', { applicationId: app.id, kind: 'deposit_reminder' }],
  ['final_reminder',   { applicationId: app.id, kind: 'final_reminder', daysRemaining: 7 }],
  ['expiration',       { applicationId: app.id, kind: 'expiration' }],
  ['cancellation',     { applicationId: app.id, kind: 'cancellation', depositForfeited: 22500 }],
  ['returner_invite',  { applicationId: app.id, kind: 'returner_invite' }],
  ['sponsor_approved', { sponsorshipId: spon?.id, status: 'approved' }],
]

const results = []
for (const [name, body] of CASES) {
  try {
    const res = await fetch(`${BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET },
      body: JSON.stringify(body),
    })
    const text = (await res.text()).slice(0, 120)
    results.push({ name, ok: res.ok, status: res.status, detail: text })
    console.log(`  ${res.ok ? 'SENT  ' : 'FAIL  '} ${name.padEnd(18)} HTTP ${res.status}  ${res.ok ? '' : text}`)
  } catch (e) {
    results.push({ name, ok: false, status: 0, detail: e.message })
    console.log(`  FAIL   ${name.padEnd(18)} ${e.message}`)
  }
  await new Promise(r => setTimeout(r, 600))   // stay under Resend's rate limit
}

// ── teardown ────────────────────────────────────────────────
if (KEEP) {
  console.log('\n--keep: records left in place. Remove them yourself.')
} else {
  await svc.from('invoices').delete().eq('application_id', app.id)
  await svc.from('applications').delete().eq('id', app.id)
  if (spon?.id) await svc.from('sponsorships').delete().eq('id', spon.id)
  await svc.auth.admin.deleteUser(userId)
  console.log('\nTest records removed.')
}

// ── report ──────────────────────────────────────────────────
const failed = results.filter(r => !r.ok)
console.log('\n══════ RESULT ══════')
console.log(`  accepted by the API : ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  console.log('  FAILED              : ' + failed.map(f => f.name).join(', '))
}

console.log(`\n  Now open ${TO} and tick each one off. API-accepted is NOT delivered.`)
for (const r of results) console.log(`    [ ] ${r.name}${r.ok ? '' : '   (never sent — fix first)'}`)
console.log('\n  Check spam as well as inbox. All nine must arrive before')
console.log('  LIFECYCLE_SWEEP_ENABLED is set — the sweep releases booths on the')
console.log('  assumption that its warnings were delivered.')

process.exit(failed.length ? 1 : 0)
