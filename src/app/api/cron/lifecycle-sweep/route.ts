import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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

export async function GET(req: Request) {
  // Vercel Cron and manual callers both use Bearer auth.
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Kill switch — default OFF ───────────────────────────────
  // This sweep does not merely send reminders: it flips applications to
  // expired/canceled AND releases their booths, and the booth release is not
  // reversible from inside the platform (no assignment history is kept).
  //
  // Its target profile is "approved application whose invoice has no
  // deposit_paid_at" — which is exactly an exhibitor who paid through a Stripe
  // invoice outside the platform. Set LIFECYCLE_SWEEP_ENABLED=true only once
  // those payments are recorded against their invoices.
  if (process.env.LIFECYCLE_SWEEP_ENABLED !== 'true') {
    return NextResponse.json({
      skipped: true,
      reason: 'LIFECYCLE_SWEEP_ENABLED is not "true" — sweep disabled.',
    })
  }

  // ── Second gate: the destructive branches ───────────────────
  // Staged arming. LIFECYCLE_SWEEP_ENABLED turns the sweep on; this turns on
  // the two branches that expire applications and RELEASE BOOTHS. Booth release
  // is irreversible — there is no assignment history table — so the first live
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
  // DESTRUCTIVE — releases booths. Counted but not acted on until the flag is set.
  const { data: toExpire } = await supabase
    .from('applications')
    .select('id, business_name, invoices!inner(id, deposit_paid_at)')
    .eq('status', 'approved')
    .lt('deposit_due_at', now.toISOString())
    .is('invoices.deposit_paid_at', null)

  for (const app of toExpire ?? []) {
    if (!destructive) {
      console.log(`[sweep] WOULD EXPIRE ${app.id} (${app.business_name}) — destructive branch disabled`)
      summary.would_expire++
      continue
    }
    // One RPC, one transaction (migration 035). Previously two round trips:
    // a failure between them left the application expired with its booth still
    // assigned — held by an expired application, invisible to both the
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
    .lt('final_due_at', now.toISOString())
    .is('invoices.final_paid_at', null)

  for (const app of toCancel ?? []) {
    if (!destructive) {
      console.log(`[sweep] WOULD CANCEL ${app.id} — destructive branch disabled`)
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
      .gte('final_due_at', low)
      .lte('final_due_at', high)
      .is('invoices.final_paid_at', null)

    for (const app of toRemindFinal ?? []) {
      await sendEmail('final_reminder', app.id, { daysRemaining: daysOut })
      summary.final_reminders++
    }
  }

  return NextResponse.json({
    ok: true,
    mode: destructive ? 'full' : 'reminders-only',
    ranAt: now.toISOString(),
    ...(destructive ? {} : {
      note: 'Expiry and cancellation were NOT performed. would_expire / would_cancel ' +
            'are what a full run WOULD have acted on. Set LIFECYCLE_SWEEP_DESTRUCTIVE=true ' +
            'only after a full cycle of reminders-only has been reviewed.',
    }),
    summary,
  })
}
