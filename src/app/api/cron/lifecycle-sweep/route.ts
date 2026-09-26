import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { runPlacementCheck, diffFindings, type Finding } from '@/lib/placement-check'
import { reminderStage, isTestSponsorship, TEST_SPONSOR_PREFIX } from '@/lib/sponsor-reminders'
import { todayEastern } from '@/lib/date-only'
import { sponsorDueReminderEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aatc-platform.vercel.app'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MS_TOLERANCE = 12 * 60 * 60 * 1000 // ± 12h window for "exactly N days from now" matches

function adminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function sendEmail(kind: string, applicationId: string, extra: Record<string, unknown> = {}) {
  await fetch(`${SITE_URL}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET ?? '',
    },
    body: JSON.stringify({ kind, applicationId, ...extra }),
  })
}


/**
 * The standing placement check, folded into this sweep rather than given its own
 * cron entry. It is four small reads with no fan-out, so it costs nothing to run
 * here, and one job that does two things beats two jobs nobody watches.
 *
 * RECORDS THE RUN WHATEVER HAPPENS. The dashboard has to tell no-findings from
 * never-ran from errored, and a card that renders nothing means all three - two
 * of which mean the check is broken. A failure is stored as status 'error' with
 * the reason, never as an empty finding set, because an empty set reads as
 * all-clear to both the card and the diff.
 *
 * EMAILS ONLY WHAT CHANGED, and only when something ACTIONABLE is new. Never
 * daily, never on all-clear. This shares an inbox with the alert for a payment
 * taken and not recorded, so a routine "still 3 findings" would train its
 * readers to ignore the channel - and the thing they would start ignoring is
 * the payment alert.
 */
async function placementCheck(supabase: ReturnType<typeof adminSupabase>) {
  const { data: previous } = await supabase
    .from('placement_check_runs')
    .select('finding_keys')
    .eq('status', 'ok')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let findings: Finding[]
  try {
    const result = await runPlacementCheck(supabase)
    findings = result.findings
    await supabase.from('placement_check_runs').insert({
      status: 'ok',
      findings: result.findings as unknown as never,
      finding_keys: result.findingKeys,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[placement-check] FAILED: ${message}`)
    await supabase.from('placement_check_runs').insert({ status: 'error', error_message: message })
    return { ok: false, error: message }
  }

  // Diff against the last SUCCESSFUL run. Diffing against an errored run would
  // treat every live finding as new and send a duplicate alert the morning after
  // any transient failure.
  const previousKeys = (previous?.finding_keys as string[] | undefined) ?? []
  const { added, resolvedKeys } = diffFindings(findings, previousKeys)
  const newActionable = added.filter(f => f.actionable)

  // A first run has no baseline. Everything looks new, which is true but is not
  // a CHANGE - and an alert listing every pre-existing finding is the "3
  // findings" mail this design exists to avoid. Record it, do not send it.
  const isFirstRun = previous === null

  if (newActionable.length > 0 && !isFirstRun) {
    await sendPlacementAlert(newActionable, resolvedKeys.length)
  }

  return {
    ok: true,
    findings: findings.length,
    actionable: findings.filter(f => f.actionable).length,
    new_actionable: newActionable.length,
    resolved: resolvedKeys.length,
    emailed: newActionable.length > 0 && !isFirstRun,
  }
}

async function sendPlacementAlert(added: Finding[], resolvedCount: number) {
  const to = process.env.PAYMENT_ALERT_EMAIL
  if (!to || !process.env.RESEND_API_KEY) {
    // Loud, because the finding is real and nobody is being told about it.
    console.error(
      '[placement-check] ALERT NOT SENT - PAYMENT_ALERT_EMAIL or RESEND_API_KEY unset. ' +
      `${added.length} new placement finding(s) went unreported.`
    )
    return
  }

  // The subject carries the finding when there is exactly one, because a
  // subject that reads "1 placement finding" makes the reader open the mail to
  // learn something the subject could have told them.
  const subject = added.length === 1
    ? `AATC placement: ${added[0].message}`
    : `AATC placement: ${added.length} new findings`

  const lines = added.map(f => `<li>${f.message}</li>`).join('')
  const resolved = resolvedCount > 0
    ? `<p style="color:#666;font-size:13px;">${resolvedCount} previous finding(s) no longer apply.</p>`
    : ''

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to,
        subject,
        html:
          `<p>New since the last check:</p><ul>${lines}</ul>${resolved}` +
          `<p style="color:#666;font-size:13px;">A sponsor is not receiving a placement they paid for. ` +
          `The full current list is on the admin dashboard.</p>`,
      }),
    })
  } catch (e) {
    console.error(`[placement-check] alert send failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Sponsor invoices: reminders 30 and 7 days before due_date (081). Nothing
 * else - a sponsorship is never expired or cancelled by this sweep, and
 * nothing is sent after the due date. Runs whether or not the BOOTH sweep is
 * armed, behind its own switch: SPONSOR_REMINDERS_ENABLED=true sends; anything
 * else reports what WOULD be sent. Each reminder is claimed (compare-and-set
 * on its *_sent_at column) before sending and released if the send fails, so
 * it goes out at most once and a failed day is retried the next.
 */
async function sponsorReminders(supabase: ReturnType<typeof adminSupabase>, now: Date, send: boolean) {
  const today = todayEastern(now)
  const out = { mode: send ? 'send' : 'report-only', today, sent: [] as string[], would_send: [] as string[], no_email: [] as string[], failed: [] as string[], errors: [] as string[] }
  const { data, error } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid, status, due_date, due_reminder_30_sent_at, due_reminder_7_sent_at, sponsorship:sponsorships!inner(sponsor_name, email, user_id)')
    .not('sponsorship_id', 'is', null)
    .not('due_date', 'is', null)
    .in('status', ['pending', 'overdue'])
    // Test sponsorships (RLS harness, verify fixtures) are never reminded.
    .not('sponsorship.sponsor_name', 'ilike', `${TEST_SPONSOR_PREFIX}%`)
  // A query that errors returns null data, which would read as "nobody due".
  if (error) { out.errors.push(error.message); return out }

  for (const inv of data ?? []) {
    const stage = reminderStage(inv, today)
    if (!stage) continue
    const spon = inv.sponsorship as unknown as { sponsor_name: string; email: string | null; user_id: string | null }
    if (isTestSponsorship(spon.sponsor_name)) continue // belt and braces with the query filter
    let to = spon.email?.trim() || null
    if (!to && spon.user_id) {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', spon.user_id).maybeSingle()
      to = prof?.email?.trim() || null
    }
    const label = `${spon.sponsor_name} (${stage}d, due ${inv.due_date})`
    if (!to) { out.no_email.push(label); continue }
    if (!send) { out.would_send.push(`${label} -> ${to}`); continue }

    const col = stage === 30 ? 'due_reminder_30_sent_at' : 'due_reminder_7_sent_at'
    const { data: claimed, error: claimErr } = await supabase.from('invoices')
      .update({ [col]: now.toISOString() }).eq('id', inv.id).is(col, null).select('id')
    if (claimErr) { out.errors.push(`${label}: ${claimErr.message}`); continue }
    if (!claimed || claimed.length === 0) continue // claimed by a concurrent run

    try {
      await sendTransactional(to, `AATC 2027 sponsorship balance due ${inv.due_date}`, sponsorDueReminderEmail({
        sponsorName: spon.sponsor_name,
        balanceCents: inv.amount - (inv.amount_paid ?? 0),
        dueDate: inv.due_date!,
        daysOut: stage,
        hasAccount: !!spon.user_id,
      }))
      out.sent.push(`${label} -> ${to}`)
    } catch (e) {
      console.error(`[sweep] sponsor reminder ${inv.id} failed: ${String(e)}`)
      await supabase.from('invoices').update({ [col]: null }).eq('id', inv.id)
      out.failed.push(label)
    }
  }
  return out
}

type DryRow = { id: string; business_name: string; email: string; due: string | null; days_out: number | null }
const dayDiff = (iso: string | null, now: Date) => iso ? Math.round((new Date(iso).getTime() - now.getTime()) / ONE_DAY_MS) : null

/**
 * What the four branches would select at `now`. Every query carries the same
 * filters as the live branches, including `comped_at is null` (072): a comped
 * exhibitor is never chased. Ryan reviews this before LIFECYCLE_SWEEP_ENABLED
 * is set (HANDOFF).
 */
async function dryRunReport(supabase: ReturnType<typeof adminSupabase>, now: Date) {
  const row = (a: { id: string; business_name: string; email: string }, due: string | null): DryRow =>
    ({ id: a.id, business_name: a.business_name, email: a.email, due, days_out: dayDiff(due, now) })
  // A negative report needs a positive control: a query that ERRORS (for
  // example comped_at missing because 072 is not applied) returns null data,
  // which would read as "nothing to do". Every error is reported by name.
  const errors: string[] = []
  const note = (branch: string, e: { message: string } | null) => { if (e) errors.push(`${branch}: ${e.message}`) }

  const { data: expire, error: e1 } = await supabase.from('applications')
    .select('id, business_name, email, deposit_due_at, invoices!inner(deposit_paid_at)')
    .eq('status', 'approved').is('comped_at', null)
    .lt('deposit_due_at', now.toISOString()).is('invoices.deposit_paid_at', null)
  note('would_expire', e1)
  const { data: cancel, error: e2 } = await supabase.from('applications')
    .select('id, business_name, email, final_due_at, invoices!inner(final_paid_at)')
    .eq('status', 'approved').is('comped_at', null)
    .lt('final_due_at', now.toISOString()).is('invoices.final_paid_at', null)
  note('would_cancel', e2)

  const target = new Date(now.getTime() + 7 * ONE_DAY_MS)
  const { data: depositReminder, error: e3 } = await supabase.from('applications')
    .select('id, business_name, email, deposit_due_at, invoices!inner(deposit_paid_at)')
    .eq('status', 'approved').is('comped_at', null)
    .gte('deposit_due_at', new Date(target.getTime() - MS_TOLERANCE).toISOString())
    .lte('deposit_due_at', new Date(target.getTime() + MS_TOLERANCE).toISOString())
    .is('invoices.deposit_paid_at', null)
  note('would_send_deposit_reminder', e3)

  const finalReminders: Array<DryRow & { days: number }> = []
  for (const daysOut of [30, 14, 7, 1]) {
    const t = new Date(now.getTime() + daysOut * ONE_DAY_MS)
    const { data, error: e4 } = await supabase.from('applications')
      .select('id, business_name, email, final_due_at, invoices!inner(final_paid_at)')
      .eq('status', 'approved').is('comped_at', null)
      .gte('final_due_at', new Date(t.getTime() - MS_TOLERANCE).toISOString())
      .lte('final_due_at', new Date(t.getTime() + MS_TOLERANCE).toISOString())
      .is('invoices.final_paid_at', null)
    note(`would_send_final_reminder[${daysOut}]`, e4)
    for (const a of data ?? []) finalReminders.push({ ...row(a, a.final_due_at), days: daysOut })
  }

  // Context the reviewer needs: every approved, un-comped application whose
  // deposit is not recorded, with its deadline, whether or not a branch fires today.
  const { data: watch, error: e5 } = await supabase.from('applications')
    .select('id, business_name, email, deposit_due_at, final_due_at, invoices(deposit_paid_at, final_paid_at)')
    .eq('status', 'approved').is('comped_at', null)
  note('approved_uncomped_watchlist', e5)

  return {
    dry_run: true,
    ran_at: now.toISOString(),
    // Non-empty means the report is NOT trustworthy. The script refuses to
    // print an all-clear over it.
    errors,
    would_expire: (expire ?? []).map(a => row(a, a.deposit_due_at)),
    would_cancel: (cancel ?? []).map(a => row(a, a.final_due_at)),
    would_send_deposit_reminder: (depositReminder ?? []).map(a => row(a, a.deposit_due_at)),
    would_send_final_reminder: finalReminders,
    approved_uncomped_watchlist: (watch ?? []).map(a => {
      const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices
      return {
        ...row(a, a.deposit_due_at),
        final_due: a.final_due_at,
        deposit_recorded: !!inv?.deposit_paid_at,
        final_recorded: !!inv?.final_paid_at,
        has_invoice: !!inv,
      }
    }),
  }
}

export async function GET(req: Request) {
  // Vercel Cron and manual callers both use Bearer auth.
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Dry run: ?dry_run=1 reports what a FULL run would do, right now,
  // against live data. Reads only: no emails, no expiries, no placement-check
  // row. Works while the kill switch is off, so the first real run is never
  // the first look. The same query shapes as below, with the same guards.
  if (new URL(req.url).searchParams.get('dry_run') === '1') {
    return NextResponse.json({
      ...(await dryRunReport(adminSupabase(), new Date())),
      sponsor_reminders: await sponsorReminders(adminSupabase(), new Date(), false),
    })
  }

  // Sponsor due-date reminders run whether or not the booth sweep is armed:
  // they never expire anything, so they do not wait on its review.
  const sponsor = await sponsorReminders(adminSupabase(), new Date(), process.env.SPONSOR_REMINDERS_ENABLED === 'true')

  // ── Kill switch - default OFF ───────────────────────────────
  // This sweep does not merely send reminders: it flips applications to
  // expired/canceled AND releases their booths, and the booth release is not
  // reversible from inside the platform (no assignment history is kept).
  //
  // Its target profile is "approved application whose invoice has no
  // deposit_paid_at" - which is exactly an exhibitor who paid through a Stripe
  // invoice outside the platform. Set LIFECYCLE_SWEEP_ENABLED=true only once
  // those payments are recorded against their invoices.
  if (process.env.LIFECYCLE_SWEEP_ENABLED !== 'true') {
    return NextResponse.json({
      skipped: true,
      reason: 'LIFECYCLE_SWEEP_ENABLED is not "true" - booth sweep disabled.',
      sponsor_reminders: sponsor,
    })
  }

  // ── Second gate: the destructive branches ───────────────────
  // Staged arming. LIFECYCLE_SWEEP_ENABLED turns the sweep on; this turns on
  // the two branches that expire applications and RELEASE BOOTHS. Booth release
  // is irreversible - there is no assignment history table - so the first live
  // run must not be the first real test. Run reminders-only for a full cycle,
  // confirm the right people were warned and nobody else was, then set this.
  const destructive = process.env.LIFECYCLE_SWEEP_DESTRUCTIVE === 'true'

  const supabase = adminSupabase()
  const now = new Date()
  // Counters are deliberately separate for the two modes. Reporting
  // `expired: 3` from a reminders-only run would read as three expiries having
  // happened, which is exactly the kind of misreading this staging exists to
  // avoid. In reminders-only mode nothing is expired and the counts are
  // would_expire / would_cancel.
  const summary = {
    expired: 0,
    canceled: 0,
    would_expire: 0,
    would_cancel: 0,
    deposit_reminders: 0,
    final_reminders: 0,
  }

  // ── 1. Expire un-deposited applications past deposit_due_at ──
  // DESTRUCTIVE - releases booths. Counted but not acted on until the flag is set.
  const { data: toExpire } = await supabase
    .from('applications')
    .select('id, business_name, invoices!inner(id, deposit_paid_at)')
    .eq('status', 'approved')
    .is('comped_at', null)
    .lt('deposit_due_at', now.toISOString())
    .is('invoices.deposit_paid_at', null)

  for (const app of toExpire ?? []) {
    if (!destructive) {
      console.log(`[sweep] WOULD EXPIRE ${app.id} (${app.business_name}) - destructive branch disabled`)
      summary.would_expire++
      continue
    }
    // One RPC, one transaction (migration 035). Previously two round trips:
    // a failure between them left the application expired with its booth still
    // assigned - held by an expired application, invisible to both the
    // available-booths view and the exhibitor.
    const { error } = await supabase.rpc('expire_application', { p_application_id: app.id })
    if (error) {
      console.error(`[sweep] expire_application failed for ${app.id}: ${error.message}`)
      continue
    }
    await sendEmail('expiration', app.id)
    summary.expired++
  }

  // ── 2. Cancel un-final-paid applications past final_due_at ──
  const { data: toCancel } = await supabase
    .from('applications')
    .select('id, invoices!inner(id, final_paid_at, amount_paid)')
    .eq('status', 'approved')
    .is('comped_at', null)
    .lt('final_due_at', now.toISOString())
    .is('invoices.final_paid_at', null)

  for (const app of toCancel ?? []) {
    if (!destructive) {
      console.log(`[sweep] WOULD CANCEL ${app.id} - destructive branch disabled`)
      summary.would_cancel++
      continue
    }
    const inv = Array.isArray(app.invoices) ? app.invoices[0] : app.invoices
    const forfeited = inv?.amount_paid ?? 0
    const { error } = await supabase.rpc('cancel_application', { p_application_id: app.id })
    if (error) {
      console.error(`[sweep] cancel_application failed for ${app.id}: ${error.message}`)
      continue
    }
    await sendEmail('cancellation', app.id, { depositForfeited: forfeited })
    summary.canceled++
  }

  // ── 3. Deposit reminder: 7 days before deposit_due_at, no deposit ──
  const reminderTarget = new Date(now.getTime() + 7 * ONE_DAY_MS)
  const reminderLow = new Date(reminderTarget.getTime() - MS_TOLERANCE).toISOString()
  const reminderHigh = new Date(reminderTarget.getTime() + MS_TOLERANCE).toISOString()

  const { data: toRemindDeposit } = await supabase
    .from('applications')
    .select('id, invoices!inner(deposit_paid_at)')
    .eq('status', 'approved')
    .is('comped_at', null)
    .gte('deposit_due_at', reminderLow)
    .lte('deposit_due_at', reminderHigh)
    .is('invoices.deposit_paid_at', null)

  for (const app of toRemindDeposit ?? []) {
    await sendEmail('deposit_reminder', app.id)
    summary.deposit_reminders++
  }

  // ── 4. Final-payment reminders at 30 / 14 / 7 / 1 days before final_due_at ──
  for (const daysOut of [30, 14, 7, 1]) {
    const target = new Date(now.getTime() + daysOut * ONE_DAY_MS)
    const low = new Date(target.getTime() - MS_TOLERANCE).toISOString()
    const high = new Date(target.getTime() + MS_TOLERANCE).toISOString()

    const { data: toRemindFinal } = await supabase
      .from('applications')
      .select('id, invoices!inner(final_paid_at)')
      .eq('status', 'approved')
      .is('comped_at', null)
      .gte('final_due_at', low)
      .lte('final_due_at', high)
      .is('invoices.final_paid_at', null)

    for (const app of toRemindFinal ?? []) {
      await sendEmail('final_reminder', app.id, { daysRemaining: daysOut })
      summary.final_reminders++
    }
  }

  // Runs regardless of the destructive kill switch: it only reads and records.
  const placement = await placementCheck(supabase)

  return NextResponse.json({
    ok: true,
    mode: destructive ? 'full' : 'reminders-only',
    placement,
    sponsor_reminders: sponsor,
    ranAt: now.toISOString(),
    ...(destructive ? {} : {
      note: 'Expiry and cancellation were NOT performed. would_expire / would_cancel ' +
            'are what a full run WOULD have acted on. Set LIFECYCLE_SWEEP_DESTRUCTIVE=true ' +
            'only after a full cycle of reminders-only has been reviewed.',
    }),
    summary,
  })
}
