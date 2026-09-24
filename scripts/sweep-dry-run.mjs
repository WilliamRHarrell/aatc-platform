#!/usr/bin/env node
/**
 * Prints what the lifecycle sweep WOULD do right now, against live data, by
 * calling the sweep's own dry-run mode (one home for the queries). Nothing is
 * sent or written.
 *
 *   node scripts/sweep-dry-run.mjs                 # against NEXT_PUBLIC_SITE_URL from .env.local
 *   node scripts/sweep-dry-run.mjs http://localhost:3000
 *
 * Needs CRON_SECRET in .env.local (the same value the deployment holds).
 */
import { readFileSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const base = process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL
const secret = process.env.CRON_SECRET
if (!base || !secret) { console.error('Need a base URL (arg or NEXT_PUBLIC_SITE_URL) and CRON_SECRET'); process.exit(1) }

const res = await fetch(`${base.replace(/\/$/, '')}/api/cron/lifecycle-sweep?dry_run=1`, { headers: { authorization: `Bearer ${secret}` } })
if (!res.ok) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(2) }
const r = await res.json()
if (r.errors?.length) {
  console.error(`REPORT NOT TRUSTWORTHY - ${r.errors.length} query error(s); an empty branch below may be a broken query, not a clean one:`)
  for (const e of r.errors) console.error(`  ${e}`)
  console.error('(comped_at missing = migration 072 is not applied yet)')
}

const table = (title, rows, extra = () => '') => {
  console.log(`\n== ${title}: ${rows.length}`)
  for (const x of rows) console.log(`  ${x.business_name} <${x.email}>  ${x.id}  due ${x.due ?? '-'} (${x.days_out ?? '-'} d)${extra(x)}`)
}
console.log(`Sweep dry run at ${r.ran_at} against ${base}`)
table('WOULD EXPIRE (deposit overdue, booths released when destructive)', r.would_expire)
table('WOULD CANCEL (final overdue)', r.would_cancel)
table('WOULD SEND deposit reminder (7 days out)', r.would_send_deposit_reminder)
table('WOULD SEND final reminder', r.would_send_final_reminder, x => `  [${x.days} d]`)
table('WATCHLIST: approved, not comped', r.approved_uncomped_watchlist,
  x => `  deposit ${x.deposit_recorded ? 'recorded' : 'NOT recorded'}, final ${x.final_recorded ? 'recorded' : 'not recorded'}${x.has_invoice ? '' : ', NO INVOICE'}, final due ${x.final_due ?? '-'}`)
if (r.errors?.length) { console.error('\nExited non-zero because of the query errors above.'); process.exit(3) }
