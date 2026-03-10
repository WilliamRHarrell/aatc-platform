import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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
      const { error: insertError } = await supabase
        .from('panel_registrations')
        .insert({
          panel_id: panelId,
          name,
          email,
          phone: phone || null,
          social_media: socialMedia || null,
          attendee_type: attendeeType || 'patron',
          payment_status: 'na',
        })

      if (insertError) {
        console.error('Panel registration insert error:', insertError)
        return NextResponse.json(
          { error: 'Failed to register. Please try again.' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    }

    if (panel.signup_type === 'aatc_invoice') {
      const { data: registration, error: insertError } = await supabase
        .from('panel_registrations')
        .insert({
          panel_id: panelId,
          name,
          email,
          phone: phone || null,
          social_media: socialMedia || null,
          attendee_type: attendeeType || 'patron',
          payment_status: 'pending',
        })
        .select('id')
        .single()

      if (insertError || !registration) {
        console.error('Panel registration insert error:', insertError)
        return NextResponse.json(
          { error: 'Failed to register. Please try again.' },
          { status: 500 }
        )
      }

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
