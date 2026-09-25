import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { guardedWrite } from '@/lib/db-write'
import { botTrapRejection } from '@/lib/bot-trap'
import { CONTACT_EMAIL } from '@/lib/event-config'
import { validateSponsorSubmission } from '@/lib/sponsor-submission'
import { sponsorReceivedEmail, internalNewSponsorEmail, describeSponsorship } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import type { Database } from '@/types/database'

// POST /api/sponsor-apply - sponsorship application intake.
//
// Replaces the browser-side insert on /apply/sponsor (which sent nothing).
// Modelled on /api/pinup-entry: service-role client, server-side validation,
// guardedWrite on the write, then two receipts that never fail the request:
// the sponsor's "we received it" and the internal notice to CONTACT_EMAIL.
//
// The AMOUNT is computed here from SPONSOR_TIERS (validateSponsorSubmission),
// never taken from the body. The row is inserted as pending; the 049 insert
// clamp exempts the service role, so status is set here on purpose.
//
// NOT RATE LIMITED - same standing gap as the other public form routes
// (HANDOFF open item: Vercel WAF rules before launch).

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Could not read that submission. Please try again.' }, { status: 400 })
  }

  // Bot filter first. The form's real website field arrives as `websiteUrl`;
  // `website` is the honeypot and must be empty.
  const trap = botTrapRejection(body)
  if (trap) {
    console.warn(`[sponsor-apply] rejected as automated: ${trap}`)
    return NextResponse.json({ error: 'We could not verify that submission. Please try again.' }, { status: 400 })
  }

  const v = validateSponsorSubmission(body)
  if (!v.ok) {
    return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors: v.fieldErrors }, { status: 400 })
  }
  const s = v.values

  const { data: event, error: eventErr } = await supabase.from('events').select('id').eq('is_active', true).single()
  if (eventErr || !event) {
    console.error(`[sponsor-apply] no active event (${eventErr?.code ?? 'none'}): ${eventErr?.message ?? ''}`)
    return NextResponse.json({ error: 'Applications are temporarily unavailable. Please try again shortly.' }, { status: 503 })
  }

  const res = await guardedWrite(
    supabase.from('sponsorships').insert({
      event_id: event.id,
      sponsor_name: s.sponsor_name,
      contact_name: s.contact_name,
      email: s.email,
      phone: s.phone,
      website: s.website,
      instagram: s.instagram,
      facebook: s.facebook,
      tier: s.tier,
      amount: s.amount,
      logo_url: s.logo_url,
      notes: s.notes,
      additional_items: s.additionalItems as never,
      status: 'pending',
    }).select('id'),
    'Your application did not save',
    `sponsor-apply event=${event.id}`,
  )
  if (!res.ok) {
    return NextResponse.json({ error: `${res.error}. Please try again or contact us.` }, { status: 500 })
  }
  const id = (res.data[0] as { id: string }).id

  // Receipts. The row is saved; a mail failure is logged, never surfaced as a
  // failed submission (the sponsor would resubmit and create a duplicate).
  try {
    await sendTransactional(s.email, `We received your AATC 2027 sponsorship application - ${s.sponsor_name}`,
      sponsorReceivedEmail(s.sponsor_name, s.tier, s.additionalItems, s.amount))
  } catch (e) {
    console.error(`[sponsor-apply] ${id} saved but the sponsor receipt failed: ${String(e)}`)
  }
  try {
    await sendTransactional(CONTACT_EMAIL, `New sponsor application: ${s.sponsor_name} (${describeSponsorship(s.tier, s.additionalItems)})`,
      internalNewSponsorEmail({ sponsorName: s.sponsor_name, contactName: s.contact_name, email: s.email, phone: s.phone, tier: s.tier, items: s.additionalItems, amount: s.amount, notes: s.notes }))
  } catch (e) {
    console.error(`[sponsor-apply] ${id} saved but the internal notice failed: ${String(e)}`)
  }

  return NextResponse.json({ id })
}
