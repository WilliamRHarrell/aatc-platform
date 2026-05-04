import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import type { Database } from '@/types/database'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover' as never,
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { invoiceId, amount: requestedAmount } = await req.json() as { invoiceId: string; amount?: number }
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

    // Fetch the invoice — RLS ensures this user owns it
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, amount, amount_paid, status, application_id, sponsorship_id, food_truck_id')
      .eq('id', invoiceId)
      .single()

    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    if (inv.status === 'paid' || inv.status === 'cancelled') {
      return NextResponse.json({ error: 'Invoice is not payable' }, { status: 400 })
    }

    const balance = inv.amount - (inv.amount_paid ?? 0)

    // Use requested amount or default to full balance
    const payAmount = requestedAmount ? Math.round(requestedAmount) : balance

    if (payAmount <= 0 || payAmount > balance) {
      return NextResponse.json({ error: `Payment must be between $0.01 and ${(balance / 100).toFixed(2)}` }, { status: 400 })
    }

    const isFullPayment = payAmount === balance
    let productName = 'AATC 2027'
    let description = 'AATC 2027 fee'

    if (inv.application_id) {
      const { data: app } = await supabase
        .from('applications')
        .select('business_name, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty')
        .eq('id', inv.application_id)
        .single()

      if (app) {
        productName = app.business_name
        // 2026 rows have booth_size; 2027 rows have per-size qty columns.
        let boothSummary: string
        if (app.booth_size) {
          boothSummary = app.booth_size
        } else {
          const parts: string[] = []
          if (app.artist_single_qty > 0) parts.push(`${app.artist_single_qty}× single`)
          if (app.artist_double_qty > 0) parts.push(`${app.artist_double_qty}× double`)
          if (app.vendor_single_qty > 0) parts.push(`${app.vendor_single_qty}× single`)
          if (app.vendor_double_qty > 0) parts.push(`${app.vendor_double_qty}× double`)
          boothSummary = parts.join(', ') || 'booth'
        }
        description = `AATC 2027 — ${app.exhibitor_type} booth (${boothSummary})${isFullPayment ? '' : ' — partial payment'}`
      }
    } else if (inv.sponsorship_id) {
      const { data: spon } = await supabase
        .from('sponsorships')
        .select('sponsor_name, tier')
        .eq('id', inv.sponsorship_id)
        .single()

      if (spon) {
        productName = spon.sponsor_name
        description = `AATC 2027 — ${spon.tier.replace(/_/g, ' ')} sponsorship${isFullPayment ? '' : ' — partial payment'}`
      }
    } else if (inv.food_truck_id) {
      const { data: truck } = await supabase
        .from('food_trucks')
        .select('business_name')
        .eq('id', inv.food_truck_id)
        .single()

      if (truck) {
        productName = truck.business_name
        description = `AATC 2027 — Food truck vendor fee${isFullPayment ? '' : ' — partial payment'}`
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: payAmount,
            product_data: {
              name: productName,
              description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: inv.id,
        ...(inv.application_id ? { application_id: inv.application_id } : {}),
        ...(inv.sponsorship_id ? { sponsorship_id: inv.sponsorship_id } : {}),
        ...(inv.food_truck_id ? { food_truck_id: inv.food_truck_id } : {}),
        pay_amount: String(payAmount),
      },
      success_url: `${SITE_URL}/portal?paid=1`,
      cancel_url: `${SITE_URL}/portal`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('create-checkout error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
