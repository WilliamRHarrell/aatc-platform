import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { minDepositCents } from '@/lib/pricing'
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


/**
 * Page a human. A payment succeeding in Stripe with no matching invoice row is
 * the one failure here that silently loses money, so it must not end its life
 * as a log line nobody reads. Uses the existing Resend setup rather than adding
 * a dependency, and never throws — an alert failure must not mask the original.
 */
async function alertPaymentNotRecorded(d: {
  invoiceId: string; sessionId: string; amountCents: number
}) {
  const to = process.env.PAYMENT_ALERT_EMAIL ?? process.env.RESEND_FROM_EMAIL
  if (!process.env.RESEND_API_KEY || !to) {
    console.error('[stripe] alert NOT sent — RESEND_API_KEY / PAYMENT_ALERT_EMAIL unset')
    return
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to,
        subject: `[AATC] PAYMENT NOT RECORDED — invoice ${d.invoiceId}`,
        text:
          'A Stripe payment succeeded but no invoice row was updated.\n\n' +
          `invoice_id     ${d.invoiceId}\n` +
          `stripe_session ${d.sessionId}\n` +
          `amount         $${(d.amountCents / 100).toFixed(2)}\n\n` +
          'The money is in Stripe. Reconcile the invoice by hand.',
      }),
    })
  } catch (e) {
    console.error('[stripe] alert send failed:', e)
  }
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
        .select('id, amount, amount_paid, status, deposit_paid_at, final_paid_at')
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

      // Milestone tracking — both fire at most once (idempotent on Stripe retries)
      const minDeposit = minDepositCents(inv.amount)
      const justCrossedDeposit = !inv.deposit_paid_at && newAmountPaid >= minDeposit
      const justCrossedFinal = !inv.final_paid_at && newAmountPaid >= inv.amount
      const nowIso = new Date().toISOString()

      const updateData: Record<string, unknown> = {
        amount_paid: newAmountPaid,
        stripe_payment_intent_id: paymentIntent,
      }
      if (justCrossedDeposit) {
        updateData.deposit_paid_at = nowIso
      }
      if (justCrossedFinal) {
        updateData.final_paid_at = nowIso
      }
      if (fullyPaid) {
        updateData.status = 'paid'
        updateData.paid_at = nowIso
      }

      // .select() is mandatory here. Service role means RLS cannot filter this,
      // but a predicate that simply does not match — invoice deleted, wrong id
      // in metadata — still returns zero rows with NO error. That is money taken
      // in Stripe and nothing recorded against it, and Stripe would see a 200
      // and never retry.
      const { data: updated, error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId)
        .select('id, amount, amount_paid, status')

      if (error) {
        console.error('[stripe] invoice update FAILED:', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }

      if (!updated || updated.length === 0) {
        // Return 500 deliberately: Stripe retries on non-2xx, so a transient
        // cause self-heals and a permanent one keeps alerting rather than
        // disappearing after one silent success.
        console.error(
          `[stripe] PAYMENT NOT RECORDED — invoice ${invoiceId} matched 0 rows. ` +
          `Session ${session.id}, amount ${payAmount}. Money is in Stripe and the ` +
          'database was not updated. Reconcile manually.'
        )
        await alertPaymentNotRecorded({ invoiceId, sessionId: session.id, amountCents: payAmount })
        return NextResponse.json({ error: 'Invoice not found for payment' }, { status: 500 })
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
