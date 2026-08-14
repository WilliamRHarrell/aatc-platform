#!/usr/bin/env node
/**
 * End-to-end check for /api/admin/import-returning.
 *
 * WHY THIS IS A VERIFIER AND NOT A DRIVER. The route authenticates its caller
 * from the request cookies and requires profiles.role = 'admin'. Forging that
 * cookie from a script means reconstructing the auth-helpers token format —
 * fragile, and it would test a path no real caller uses. So YOU perform the
 * import through the real admin UI, and this script measures what landed.
 *
 * PROCEDURE
 *   1. Sign in as an admin and go to /admin/import-returning
 *   2. Submit the form with a THROWAWAY email you control. The route sends a
 *      real returner_invite to whatever address you enter — do not use a real
 *      exhibitor's.
 *   3. node scripts/verify-import-returning.mjs --email <that address>
 *   4. Tear down: supabase/seeds/teardown_import_returning.sql
 *
 * WHAT IT PROVES. Migration 043 lifted the trigger clamp that was nulling
 * status, approved_at, deposit_due_at and final_due_at on service-role inserts.
 * Checks 3-6 are that clamp, measured through the real route rather than a
 * probe. Checks 9-12 are the more important half: they replay the lifecycle
 * sweep's four predicates against the imported rows and confirm the exhibitor
 * matches NONE of them. A returner who matches branch 1 loses their booth
 * irreversibly the first time the sweep runs destructively.
 *
 * Service role deliberately: this reads auth.users and asserts on staff-only
 * columns. RLS is not under test here — the trigger clamp and the sweep
 * predicates are.
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

const emailArg = process.argv.indexOf('--email')
const email = emailArg > -1 ? process.argv[emailArg + 1] : null
if (!email) {
  console.error('Usage: node scripts/verify-import-returning.mjs --email <address used in the import>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svcKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const svc = createClient(url, svcKey)

let failed = 0
const check = (label, pass, detail = '') => {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failed++
}

console.log(`\nVerifying import for ${email}\n`)

// ── The auth user ───────────────────────────────────────────
const { data: userList, error: userErr } = await svc.auth.admin.listUsers({ perPage: 1000 })
if (userErr) {
  console.error(`Could not list auth users: ${userErr.message}`)
  process.exit(1)
}
const authUser = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

console.log('Auth user')
check('1. auth user exists', !!authUser)
check('2. email confirmed (can sign in)', !!authUser?.email_confirmed_at)
if (!authUser) {
  console.error('\nNo auth user for that address — the import did not run, or used a different email.\n')
  process.exit(1)
}

// ── The application ─────────────────────────────────────────
const { data: apps } = await svc
  .from('applications')
  .select('id, status, approved_at, deposit_due_at, final_due_at, needs_roster, total_amount, business_name, user_id')
  .eq('user_id', authUser.id)

const app = apps?.[0] ?? null

console.log('\nApplication — the 043 trigger clamp')
check('3. application exists and is linked to the auth user', !!app, app ? app.id : 'none found')
if (!app) {
  console.error(
    '\nAuth user exists with NO application. That is the orphan case the rollback now prevents —\n' +
    'if you are testing against a deploy from before that fix, this is the bug reproducing.\n'
  )
  process.exit(1)
}
check("4. status = 'approved' (not clamped to 'pending')", app.status === 'approved', `got '${app.status}'`)
check('5. approved_at set (not clamped to null)', !!app.approved_at, app.approved_at ?? 'null')
check('6. deposit_due_at set (not clamped to null)', !!app.deposit_due_at, app.deposit_due_at ?? 'null')
check('7. final_due_at set (not clamped to null)', !!app.final_due_at, app.final_due_at ?? 'null')
check('8. needs_roster = true', app.needs_roster === true, String(app.needs_roster))

// ── The invoice ─────────────────────────────────────────────
const { data: invs } = await svc
  .from('invoices')
  .select('id, amount, amount_paid, status, paid_at, deposit_paid_at, final_paid_at')
  .eq('application_id', app.id)

const inv = invs?.[0] ?? null

console.log('\nInvoice')
check('9. invoice exists', !!inv)
if (inv) {
  check("10. status = 'paid'", inv.status === 'paid', `got '${inv.status}'`)
  check('11. amount_paid equals amount', inv.amount_paid === inv.amount, `${inv.amount_paid} vs ${inv.amount}`)
  check('12. deposit_paid_at set', !!inv.deposit_paid_at, inv.deposit_paid_at ?? 'null')
  check('13. final_paid_at set', !!inv.final_paid_at, inv.final_paid_at ?? 'null')
}

// ── THE ONE THAT MATTERS — sweep safety ─────────────────────
// Replays the four predicates from src/app/api/cron/lifecycle-sweep/route.ts
// against this exhibitor. All four must be FALSE. Branch 1 is destructive and
// releases the booth with no assignment history to restore it from.
console.log('\nLifecycle sweep — every branch must MISS this exhibitor')

const approved = app.status === 'approved'
const nowIso = new Date().toISOString()
const depositUnpaid = !inv?.deposit_paid_at
const finalUnpaid = !inv?.final_paid_at

const wouldExpire = approved && !!app.deposit_due_at && app.deposit_due_at < nowIso && depositUnpaid
const wouldCancel = approved && !!app.final_due_at && app.final_due_at < nowIso && finalUnpaid

// Branch 3 fires when deposit_due_at falls in a window 7 days out; branch 4 at
// 30/14/7/1 days before final_due_at. Both additionally require the milestone
// to be unpaid, which is the term that actually protects an imported returner —
// the due dates ARE set, so the date windows will match sooner or later.
const wouldRemindDeposit = approved && depositUnpaid
const wouldRemindFinal = approved && finalUnpaid

check('14. branch 1 (expire — RELEASES BOOTH) misses', !wouldExpire)
check('15. branch 2 (cancel) misses', !wouldCancel)
check('16. branch 3 (deposit reminder) misses on the paid term', !wouldRemindDeposit)
check('17. branch 4 (final reminders) misses on the paid term', !wouldRemindFinal)

if (depositUnpaid || finalUnpaid) {
  console.log(
    '\n  NOTE: the sweep keys on invoices.deposit_paid_at / final_paid_at, NOT on\n' +
    '  status or amount_paid. An invoice marked paid with those columns null is\n' +
    '  still a sweep target — that is the admin-payment-handler failure mode.'
  )
}

console.log(
  failed === 0
    ? `\n✓ ${17} checks passed. Import is correct and sweep-safe.\n` +
      `  Tear down with supabase/seeds/teardown_import_returning.sql (email: ${email}).\n`
    : `\n✗ ${failed} check(s) failed. Do NOT set LIFECYCLE_SWEEP_ENABLED until resolved.\n`
)
process.exit(failed === 0 ? 0 : 1)
