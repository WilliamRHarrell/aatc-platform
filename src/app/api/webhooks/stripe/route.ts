import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover' as never,
})

// Service role client — bypasses RLS for webhook updates
function adminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const invoiceId = session.metadata?.invoice_id
    const panelRegId = session.metadata?.panel_registration_id

    const supabase = adminSupabase()

    // Handle invoice payments (booth/sponsorship)
    if (invoiceId) {
      const payAmountStr = session.metadata?.pay_amount

      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null

      // Fetch current invoice state
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, amount, amount_paid, status')
        .eq('id', invoiceId)
        .single()

      if (!inv || inv.status === 'paid') {
        console.log(`Invoice ${invoiceId} already paid or not found, skipping`)
        return NextResponse.json({ received: true })
      }

      // Calculate new amount_paid
      const payAmount = payAmountStr ? parseInt(payAmountStr, 10) : (inv.amount - (inv.amount_paid ?? 0))
      const newAmountPaid = (inv.amount_paid ?? 0) + payAmount
      const fullyPaid = newAmountPaid >= inv.amount

      const updateData: Record<string, unknown> = {
        amount_paid: newAmountPaid,
        stripe_payment_intent_id: paymentIntent,
      }
      if (fullyPaid) {
        updateData.status = 'paid'
        updateData.paid_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId)

      if (error) {
        console.error('Failed to update invoice payment:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      console.log(`Invoice ${invoiceId}: ${fullyPaid ? 'paid in full' : `partial payment of ${payAmount} cents`} via Stripe session ${session.id}`)
    }

    // Handle panel registration payments
    if (panelRegId) {
      const { error } = await supabase
        .from('panel_registrations')
        .update({
          payment_status: 'paid',
          stripe_payment_intent_id: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        })
        .eq('id', panelRegId)

      if (error) {
        console.error('Failed to update panel registration payment:', error)
      } else {
        console.log(`Panel registration ${panelRegId} marked as paid via Stripe session ${session.id}`)
      }
    }

    if (!invoiceId && !panelRegId) {
      console.log(`checkout.session.completed with no recognized metadata, session ${session.id}`)
    }
  }

  return NextResponse.json({ received: true })
}
