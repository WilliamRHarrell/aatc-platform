import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { guardedWrite } from '@/lib/db-write'
import { PINUP_REGISTRATION_OPEN, AATC_MAILING_ADDRESS } from '@/lib/event-config'
import { botTrapRejection } from '@/lib/bot-trap'

// POST /api/pinup-entry - Miss AATC Pinup Contest intake.
//
// Replaces a client-side stub that recorded nothing and told every entrant they
// were registered. Modelled on panel-register: service-role client, server-side
// validation, guardedWrite on the write.
//
// The capacity decision is NOT made here. It is made inside
// register_pinup_entry(), which takes an advisory lock so that a count and an
// insert are one atomic step. Counting in this route and then inserting would
// be two round trips with no lock between them, and two people submitting
// together would both read 24 and both be told they had the last place. The
// route never sends a status; it only reports the one the database assigned.
//
// NOT RATE LIMITED - flagged, not invented. There is no rate limiting or
// captcha anywhere in this repo, so there was no existing pattern to follow.
// panel-register is equally unprotected, and /apply/artist is not comparable
// because it requires a signed-in user. This is the first anonymous,
// unauthenticated write path on a public page, so it is the first one that can
// be hammered by anyone who finds it. The unique index on (event_id, email)
// blocks trivial duplicate spam; it does not stop varied-email flooding.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'AATC 2027 <onboarding@resend.dev>'

// Sent inline rather than through /api/send-email, which requires an admin
// session or the cron secret - neither of which an anonymous entrant has.
// Same Resend call and the same FROM, so it is the existing pattern, not a
// second mechanism.
//
// The two versions say different things. A waitlisted entrant must never
// receive a mail saying they are registered; that is the same false promise
// the removed stub made, only harder to retract once it is in an inbox.
// No prize amounts in either: they are unconfirmed and held.
async function sendConfirmation(to: string, name: string, status: 'confirmed' | 'waitlist', optedIn: boolean) {
  const registered = status === 'confirmed'
  const subject = registered
    ? 'You are registered - Miss AATC Pinup Contest'
    : 'You are on the waitlist - Miss AATC Pinup Contest'

  const body = registered
    ? `<p>Hi ${name},</p>
       <p>Your entry to the Miss AATC Pinup Contest is confirmed.</p>
       <p>The contest is <strong>Saturday, April 17 at 2:00 PM</strong> on the main stage.
          Please check in backstage by <strong>1:00 PM</strong>.</p>
       <p>If you can no longer take part, please reply to this email so we can offer
          your place to someone on the waitlist.</p>`
    : `<p>Hi ${name},</p>
       <p>Thank you for entering the Miss AATC Pinup Contest. All 25 places were taken
          when your entry arrived, so you are currently <strong>on the waitlist</strong>.
          You are not registered for the contest.</p>
       <p>We will contact you if a place opens up. You are also welcome to come to the
          contest table on the day - if fewer contestants check in than registered,
          places are filled from the waitlist first.</p>`

  // This message is TRANSACTIONAL: it is the receipt for an action the person
  // just took. CAN-SPAM's unsubscribe and physical-address requirements apply to
  // COMMERCIAL mail, not to this. That distinction is load-bearing rather than
  // pedantic - putting a prominent unsubscribe on a contest confirmation invites
  // someone to switch off the channel that carries their check-in time and any
  // schedule change, and they would not know that is what they had done.
  //
  // So the unsubscribe here governs MARKETING only, is shown only to people who
  // actually opted in, and says which of the two it turns off. Contest mail keeps
  // coming either way.
  const footer: string[] = ['All American Tattoo Convention']
  // Omitted rather than guessed. See AATC_MAILING_ADDRESS - the venue address is
  // not the business address and must not stand in for it.
  if (AATC_MAILING_ADDRESS) footer.push(AATC_MAILING_ADDRESS)
  if (optedIn) {
    footer.push(
      'You asked us to email you about future AATC events. That is separate from ' +
      'this contest: reply with UNSUBSCRIBE to stop event email. You will still ' +
      'receive messages about the contest you entered.'
    )
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: `${body}<p style="color:#888;font-size:12px">${footer.join('<br>')}</p>`,
  })
  if (error) throw new Error(String(error.message ?? error))
}

// Deliberately permissive but structural. Rejecting valid addresses is worse
// than accepting an odd one: a contestant turned away by a regex has no way to
// enter at all.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length !== 10) return null
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
}

export async function POST(req: NextRequest) {
  // Closed at the ROUTE, not just in the UI. Hiding the form changes nothing
  // about what this endpoint accepts - it is reachable by anyone who has seen
  // the path, form or no form. This is the gate.
  if (!PINUP_REGISTRATION_OPEN) {
    return NextResponse.json(
      { error: 'Online registration is not open yet. Please check back shortly.' },
      { status: 503 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Could not read that submission. Please try again.' }, { status: 400 })
  }

  // Bot filter before any work. Rejected submissions are never told which
  // signal caught them - naming it is how the next attempt avoids both.
  const trap = botTrapRejection(body)
  if (trap) {
    console.warn(`[pinup-entry] rejected as automated: ${trap}`)
    return NextResponse.json(
      { error: 'We could not verify that submission. Please try again.' },
      { status: 400 }
    )
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const fullName = str(body.fullName)
  const stageName = str(body.stageName)
  const email = str(body.email)
  const phoneRaw = str(body.phone)
  const address = str(body.address)
  const notes = str(body.notes)
  const ageConfirmed = body.ageConfirmed === true
  // Consent is read as a boolean and nothing else. The client does NOT supply
  // the timestamp - a self-reported consent time is not evidence of anything,
  // and it is the field that would matter if the consent were ever questioned.
  const marketingOptIn = body.marketingOptIn === true

  // Server-side, not browser-side. `required` attributes are a convenience for
  // the person filling the form in, not a check - anything can POST here.
  const fieldErrors: Record<string, string> = {}
  if (!fullName) fieldErrors.fullName = 'Please enter your full name.'
  if (!email) fieldErrors.email = 'Please enter your email address.'
  else if (!EMAIL.test(email)) fieldErrors.email = 'That email address does not look right.'
  if (!phoneRaw) fieldErrors.phone = 'Please enter a phone number.'
  if (!ageConfirmed) fieldErrors.ageConfirmed = 'Contestants must be 18 or older.'

  const phone = phoneRaw ? normalisePhone(phoneRaw) : null
  if (phoneRaw && !phone) fieldErrors.phone = 'Please enter a 10 digit US phone number.'

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors }, { status: 400 })
  }

  // The active event, resolved server-side. Never accepted from the client, and
  // never hardcoded: b3630abd is an inactive decoy row kept as a rollback
  // anchor, and entries written against it would be invisible everywhere.
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id')
    .eq('is_active', true)
    .single()

  if (eventErr || !event) {
    console.error(`[pinup-entry] no active event (${eventErr?.code ?? 'none'}): ${eventErr?.message ?? ''}`)
    return NextResponse.json(
      { error: 'Registration is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    )
  }

  const res = await guardedWrite(
    supabase.rpc('register_pinup_entry', {
      p_event_id: event.id,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_stage_name: stageName || null,
      p_address: address || null,
      p_notes: notes || null,
      p_marketing_opt_in: marketingOptIn,
    }),
    'Your entry did not save',
    `pinup-entry event=${event.id}`,
  )

  if (!res.ok) {
    // 23505 is the partial unique index on (event_id, lower(email)).
    const duplicate = typeof res.error === 'string' && /duplicate|23505/i.test(res.error)
    if (duplicate) {
      return NextResponse.json(
        { error: 'That email address is already registered for this contest. Contact us if you need to change your details.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: `${res.error}. Please try again, or register at the contest table on the day.` },
      { status: 500 }
    )
  }

  const row = Array.isArray(res.data) ? res.data[0] : res.data
  const status = (row as { status?: string } | undefined)?.status

  // Only ever reports what the database actually recorded. A waitlisted entrant
  // is never told they are registered.
  if (status !== 'confirmed' && status !== 'waitlist') {
    console.error(`[pinup-entry] unexpected status from register_pinup_entry: ${String(status)}`)
    return NextResponse.json(
      { error: 'Your entry saved but we could not confirm your place. Please contact us.' },
      { status: 500 }
    )
  }

  // The entry is saved at this point. An email failure must NOT fail the
  // request or the entrant would resubmit, hit the duplicate-email index, and
  // be told they are already registered by a form that just showed them an
  // error. Logged loudly instead - the row is the source of truth, and the
  // admin list is where a missing mail gets noticed.
  try {
    await sendConfirmation(email, fullName, status, marketingOptIn)
  } catch (e) {
    console.error(`[pinup-entry] entry ${String((row as { id?: string } | undefined)?.id)} saved but confirmation email failed: ${String(e)}`)
  }

  return NextResponse.json({ status })
}
