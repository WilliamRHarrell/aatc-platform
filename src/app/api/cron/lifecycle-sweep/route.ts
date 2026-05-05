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

  const supabase = adminSupabase()
  const now = new Date()
  const summary: Record<string, number> = {
    expired: 0,
    canceled: 0,
    deposit_reminders: 0,
    final_reminders: 0,
  }

  // ── 1. Expire un-deposited applications past deposit_due_at ──
  const { data: toExpire } = await supabase
    .from('applications')
    .select('id, business_name, invoices!inner(id, deposit_paid_at)')
    .eq('status', 'approved')
    .lt('deposit_due_at', now.toISOString())
    .is('invoices.deposit_paid_at', null)

  for (const app of toExpire ?? []) {
    await supabase.from('applications').update({ status: 'expired' }).eq('id', app.id)
    await supabase.from('booths').update({ application_id: null, status: 'available' }).eq('application_id', app.id)
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
    const inv = Array.isArray(app.invoices) ? app.invoices[0] : app.invoices
    const forfeited = inv?.amount_paid ?? 0
    await supabase.from('applications').update({ status: 'canceled' }).eq('id', app.id)
    await supabase.from('booths').update({ application_id: null, status: 'available' }).eq('application_id', app.id)
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

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), summary })
}
