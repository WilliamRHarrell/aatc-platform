import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { guardedWrite } from '@/lib/db-write'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { panelId, name, email, phone, socialMedia, attendeeType } = await req.json()

    // Validate required fields
    if (!panelId || !name || !email) {
      return NextResponse.json(
        { error: 'Panel ID, name, and email are required.' },
        { status: 400 }
      )
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
    if (panel.signup_type === 'none' || panel.signup_type === 'email_host') {
      return NextResponse.json(
        { error: 'Registration is not available for this panel.' },
        { status: 400 }
      )
    }

    if (panel.signup_type === 'free_registration') {
      // NO CAPACITY CHECK, DELIBERATELY. Seminars are not access-controlled:
      // registration exists for planning and follow-up, and walk-ins are
      // welcome if there is room. Refusing the 51st signup would turn away
      // someone who would have walked in anyway — losing both the attendee and
      // the forecast. max_capacity is a PLANNING TARGET, not a gate; see
      // /admin/panels. Nothing is being claimed, so there is no race to lose.
      //
      // guardedWrite is still required: a filtered or zero-row insert returns
      // error: null, and someone who thinks they are on a list they are not on
      // is worse than an error — they do not re-register, and the room is
      // undercounted.
      const res = await guardedWrite(
        supabase.from('panel_registrations').insert({
          panel_id: panelId,
          name,
          email,
          phone: phone || null,
          social_media: socialMedia || null,
          attendee_type: attendeeType || 'patron',
          payment_status: 'na',
        }).select('id'),
        'Registration did not save',
        `panel-register free_registration panel=${panelId}`,
      )

      if (!res.ok) {
        return NextResponse.json(
          { error: `${res.error} Please try again, or just come along on the day — walk-ins are welcome.` },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    }

    if (panel.signup_type === 'aatc_invoice') {
      // NOTE — A PAID SEAT IS A CLAIM, AND THIS PATH HAS NO CAP.
      // Unlike the free seminars above, someone paying for a panel is buying a
      // specific seat, so overselling here is a refund rather than an apology.
      // No paid panel exists today, which is the only reason this is acceptable.
      // Before the first one is sold this branch needs an atomic capacity check
      // — a SECURITY DEFINER function that locks the panels row FOR UPDATE,
      // counts and inserts. Counting here and inserting after is two statements
      // and two people can take the last seat. Scoped in CUTOVER §E2.
      const res = await guardedWrite(
        supabase.from('panel_registrations').insert({
          panel_id: panelId,
          name,
          email,
          phone: phone || null,
          social_media: socialMedia || null,
          attendee_type: attendeeType || 'patron',
          payment_status: 'pending',
        }).select('id'),
        'Registration did not save',
        `panel-register aatc_invoice panel=${panelId}`,
      )

      if (!res.ok) {
        return NextResponse.json({ error: `${res.error} Please try again.` }, { status: 500 })
      }
      const registration = res.data[0] as { id: string }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
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
          panel_registration_id: registration.id,
          panel_id: panelId,
        },
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/events/tattoo-panels?registered=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/events/tattoo-panels`,
      })

      return NextResponse.json({ url: session.url })
    }

    return NextResponse.json(
      { error: 'Invalid signup type.' },
      { status: 400 }
    )
  } catch (err) {
    console.error('Panel registration error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
