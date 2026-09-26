import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { CONTACT_EMAIL } from '@/lib/event-config'
import { panelRegisteredEmail, internalNewPanelRegistrationEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import { botTrapRejection } from '@/lib/bot-trap'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Stripe Checkout expires at CHECKOUT_MINUTES (Stripe's minimum is 30); the
// seat hold outlives it by five minutes so a payment completed at the last
// second still finds its seat held when the webhook arrives.
const CHECKOUT_MINUTES = 31
const HOLD_MINUTES = CHECKOUT_MINUTES + 5

// Receipt to the registrant and notice to CONTACT_EMAIL (PR 1b). Never fails
// the request: the row is saved; a mail problem is logged.
async function sendPanelReceipts(v: { name: string; email: string; phone: string | null; attendeeType: string; panelTitle: string; mode: 'free' | 'invoice' }) {
  try {
    await sendTransactional(v.email, `${v.mode === 'free' ? 'You are registered' : 'Registration started'} - ${v.panelTitle}`, panelRegisteredEmail(v.name, v.panelTitle, v.mode))
  } catch (e) {
    console.error(`[panel-register] receipt to registrant failed: ${String(e)}`)
  }
  try {
    await sendTransactional(CONTACT_EMAIL, `New seminar registration: ${v.name} - ${v.panelTitle}`, internalNewPanelRegistrationEmail(v))
  } catch (e) {
    console.error(`[panel-register] internal notice failed: ${String(e)}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Same bot filter as /api/pinup-entry. Both are anonymous public write
    // paths; the rate limit for both is a Vercel WAF rule, not code.
    const trap = botTrapRejection(body)
    if (trap) {
      console.warn(`[panel-register] rejected as automated: ${trap}`)
      return NextResponse.json(
        { error: 'We could not verify that submission. Please try again.' },
        { status: 400 }
      )
    }

    // Strings only, coerced like /api/pinup-entry: this route now sends mail
    // to `email`, and an array or an object here must never reach Resend.
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const panelId = str(body.panelId)
    const name = str(body.name)
    const email = str(body.email)
    const phone = str(body.phone)
    const socialMedia = str(body.socialMedia)
    const attendeeType = str(body.attendeeType)
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

    if (!panelId || !name || !email) {
      return NextResponse.json(
        { error: 'Panel ID, name, and email are required.' },
        { status: 400 }
      )
    }
    if (!EMAIL.test(email)) {
      return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
    }
    if (attendeeType && !['patron', 'artist', 'vendor'].includes(attendeeType)) {
      return NextResponse.json({ error: 'Unknown attendee type.' }, { status: 400 })
    }

    // Fetch panel
    const { data: panel, error: panelError } = await supabase
      .from('panels')
      .select('*')
      .eq('id', panelId)
      .eq('is_published', true)
      .single()

    if (panelError || !panel) {
      return NextResponse.json(
        { error: 'Panel not found.' },
        { status: 404 }
      )
    }

    // Only allow registration for free_registration and aatc_invoice types
    if (panel.signup_type !== 'free_registration' && panel.signup_type !== 'aatc_invoice') {
      return NextResponse.json(
        { error: 'Registration is not available for this panel.' },
        { status: 400 }
      )
    }

    // ONE PATH FOR BOTH TYPES: register_panel_seat() (migration 080) locks the
    // panel row, counts and inserts in one transaction, so two people cannot
    // both take the last seat. It returns NULL when the panel is full.
    //
    // Which panels are capped is the function's decision, not this route's:
    // a PAID panel with max_capacity always is (a paid seat is a claim); a
    // FREE panel only when hard_cap is set (a limited resource, e.g. starter
    // kits). A free panel without hard_cap is never refused - max_capacity is
    // a planning target there, walk-ins are welcome (CUTOVER, "Panel capacity").
    //
    // A paid registration holds its seat for HOLD_MINUTES while the Stripe
    // Checkout session (which expires first) is open; an abandoned checkout
    // frees the seat on its own.
    const isPaid = panel.signup_type === 'aatc_invoice'
    const { data: registrationId, error: seatErr } = await supabase.rpc('register_panel_seat', {
      p_panel_id: panelId,
      p_name: name,
      p_email: email,
      p_phone: phone || null,
      p_social_media: socialMedia || null,
      p_attendee_type: attendeeType || 'patron',
      p_hold_minutes: isPaid ? HOLD_MINUTES : null,
    })

    if (seatErr) {
      console.error(`[panel-register] register_panel_seat ${seatErr.code}: ${seatErr.message} panel=${panelId}`)
      return NextResponse.json(
        { error: isPaid
            ? 'Registration did not save. Please try again.'
            : 'Registration did not save. Please try again, or just come along on the day - walk-ins are welcome.' },
        { status: 500 }
      )
    }
    if (!registrationId) {
      return NextResponse.json(
        { error: isPaid ? 'This panel is sold out.' : 'This seminar is full.', full: true },
        { status: 409 }
      )
    }

    if (!isPaid) {
      await sendPanelReceipts({ name, email, phone: phone || null, attendeeType: attendeeType || 'patron', panelTitle: panel.title, mode: 'free' })
      return NextResponse.json({ success: true })
    }

    let sessionUrl: string | null = null
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        // Expires before the seat hold does (Stripe's minimum is 30 minutes).
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: panel.cost,
              product_data: {
                name: panel.title,
                description: 'AATC 2027 Panel Registration',
              },
            },
            quantity: 1,
          },
        ],
        customer_email: email,
        metadata: {
          panel_registration_id: registrationId,
          panel_id: panelId,
        },
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/events/tattoo-panels?registered=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/events/tattoo-panels`,
      })
      sessionUrl = session.url
    } catch (e) {
      // No checkout means no way to pay: release the held seat now rather
      // than leaving it held for HOLD_MINUTES.
      console.error(`[panel-register] Stripe session failed for registration ${registrationId}: ${String(e)}`)
      const { error: delErr } = await supabase.from('panel_registrations').delete().eq('id', registrationId).eq('payment_status', 'pending')
      if (delErr) console.error(`[panel-register] could not release held seat ${registrationId}: ${delErr.message}`)
      return NextResponse.json({ error: 'Payment could not be started. Please try again.' }, { status: 502 })
    }

    await sendPanelReceipts({ name, email, phone: phone || null, attendeeType: attendeeType || 'patron', panelTitle: panel.title, mode: 'invoice' })
    return NextResponse.json({ url: sessionUrl })
  } catch (err) {
    console.error('Panel registration error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
