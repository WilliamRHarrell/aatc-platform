import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'
import { getContent } from '@/content/getContent'
import { sendTransactional } from '@/lib/transactional-email'
import { foodTruckSelectedEmail, foodTruckDecisionEmail } from '@/lib/email-templates'
import { foodTruckPrice, FOOD_TRUCK_DEPOSIT_CENTS } from '@/lib/food-truck-pricing'
import { describeDays } from '@/lib/food-truck-submission'
import { DECISION_EMAIL_KEYS, decisionRefusal, isDecision } from '@/lib/food-truck-decision'
import { linkAccount } from '@/lib/invite-link-server'

/**
 * POST /api/admin/food-trucks/decision - Approve, Waitlist or Not selected on
 * a food truck application (091). Admin only.
 *
 * body: { id, decision: 'approved' | 'waitlisted' | 'not_selected' }
 *
 * Approve (Ryan's decisions 3 and 5):
 *   1. status -> approved. 091's trigger refuses it past events.food_truck_cap
 *      (hint FOOD_TRUCK_CAP); the admin raises the cap to approve more.
 *   2. the invoice, at the shared day price, unless the truck already has one.
 *   3. the portal account by Invite & link (lib/invite-link-server.ts).
 *   4. ONE email: "you're selected, set up your account to pay".
 * Waitlist / Not selected: the status, then the content editor's email
 * unless the truck's "don't send" box (decision_email_opt_out) is ticked.
 *
 * Each step after the status is reported, not undone: a failed invoice or
 * invite leaves an approved truck the admin can finish by hand (reconcile
 * block F lists approved trucks with no invoice; Invite & link resends).
 */
const svc = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: Request) {
  const userClient = await createServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; decision?: unknown }
  if (typeof body.id !== 'string' || !isDecision(body.decision)) {
    return NextResponse.json({ error: 'id and decision are required' }, { status: 400 })
  }
  const decision = body.decision
  const db = svc()

  const { data: truck } = await db.from('food_trucks')
    .select('id, event_id, user_id, business_name, contact_name, email, cuisine_type, days, status, decision_email_opt_out')
    .eq('id', body.id).single()
  if (!truck) return NextResponse.json({ error: 'Food truck not found' }, { status: 404 })
  const refusal = decisionRefusal(truck.status, decision)
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 })
  if (decision === 'approved' && truck.days.length === 0) {
    return NextResponse.json({ error: 'Set the truck\'s days before approving: the invoice is priced by days.' }, { status: 400 })
  }

  // ── 1. status (compare-and-set on the status we read) ─────
  const { data: moved, error: moveErr } = await db.from('food_trucks')
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq('id', truck.id).eq('status', truck.status).select('id')
  if (moveErr) {
    if (moveErr.hint === 'FOOD_TRUCK_CAP') {
      return NextResponse.json({ error: `All spots are taken (${moveErr.message.replace(/^food truck cap reached: /, '')}). Raise the cap to approve more.` }, { status: 409 })
    }
    return NextResponse.json({ error: `The decision did not save: ${moveErr.message}` }, { status: 500 })
  }
  if (!moved?.length) return NextResponse.json({ error: 'This truck changed in the meantime. Reload and try again.' }, { status: 409 })

  const facts = {
    truckName: truck.business_name.trim(),
    contactName: truck.contact_name.trim(),
    cuisine: truck.cuisine_type,
    days: describeDays(truck.days),
    price: foodTruckPrice(truck.days.length),
  }
  const copy = await getContent('foodTruckApply')
  const keys = DECISION_EMAIL_KEYS[decision]
  const problems: string[] = []
  let emailSent = false

  if (decision === 'approved') {
    // ── 2. invoice ─────────────────────────────────────────
    const { data: existing } = await db.from('invoices').select('id').eq('food_truck_id', truck.id).limit(1)
    if (!existing?.length) {
      const { error: invErr } = await db.from('invoices')
        .insert({ food_truck_id: truck.id, amount: facts.price, amount_paid: 0, status: 'pending' })
      if (invErr) problems.push(`the invoice was not created (${invErr.message}); add it in Invoices`)
    }

    // ── 3-4. account + the one email ───────────────────────
    const email = truck.email.trim().toLowerCase()
    const link = await linkAccount(db, 'food_truck', {
      id: truck.id, name: facts.truckName, user_id: truck.user_id, email, event_id: truck.event_id, status: 'approved',
    }, email)
    if (!link.ok) {
      problems.push(`no portal account was linked (${link.error}); use Invite & link`)
    } else {
      try {
        await sendTransactional(email, copy[keys.subject],
          foodTruckSelectedEmail({ body: copy[keys.body], facts, depositCents: FOOD_TRUCK_DEPOSIT_CENTS, actionUrl: link.actionUrl }))
        emailSent = true
      } catch (e) {
        console.error(`[food-trucks/decision] ${truck.id} approved but the email failed: ${String(e)}`)
        problems.push('the selected email did not send; use Invite & link to resend the account email')
      }
    }
  } else if (!truck.decision_email_opt_out) {
    try {
      await sendTransactional(truck.email.trim(), copy[keys.subject],
        foodTruckDecisionEmail({ truckName: facts.truckName, contactName: facts.contactName, body: copy[keys.body] }))
      emailSent = true
    } catch (e) {
      console.error(`[food-trucks/decision] ${truck.id} ${decision} but the email failed: ${String(e)}`)
      problems.push('the email did not send')
    }
  }

  if (emailSent) {
    await db.from('food_trucks').update({ decision_email_sent_at: new Date().toISOString() }).eq('id', truck.id)
  }
  return NextResponse.json({ ok: true, status: decision, emailSent, problems })
}
