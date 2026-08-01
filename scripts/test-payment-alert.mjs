#!/usr/bin/env node
/**
 * Send the payment-not-recorded alert with fabricated data, so you can confirm
 * it arrives BEFORE a real payment ever depends on it.
 *
 *   node scripts/test-payment-alert.mjs
 *
 * Sends the same subject/body shape the webhook sends, via the same Resend
 * setup, to the same resolved address — prefixed [TEST] so it cannot be
 * mistaken for a real incident.
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *   proves    Resend key valid, from-address accepted, PAYMENT_ALERT_EMAIL
 *             resolves, message arrives, not spam-filtered, readable on mobile
 *   does NOT  that the webhook's zero-row branch fires. That needs a real
 *             Stripe event — see the Stripe CLI recipe at the bottom.
 */
import { readFileSync, existsSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
if (existsSync(`${ROOT}.env.local`)) {
  for (const line of readFileSync(`${ROOT}.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const key = process.env.RESEND_API_KEY
const from = process.env.RESEND_FROM_EMAIL
const to = process.env.PAYMENT_ALERT_EMAIL // no fallback — see the webhook

console.log('  RESEND_API_KEY      :', key ? 'set' : 'MISSING')
console.log('  RESEND_FROM_EMAIL   :', from ?? 'MISSING')
console.log('  PAYMENT_ALERT_EMAIL :', process.env.PAYMENT_ALERT_EMAIL ?? 'UNSET — the webhook will refuse to alert')
console.log('  resolved recipient  :', to ?? 'NONE')

if (!key || !from || !to) {
  console.error('\nCannot send. Set RESEND_API_KEY, RESEND_FROM_EMAIL and PAYMENT_ALERT_EMAIL.')
  process.exit(1)
}

const fake = {
  invoiceId: '00000000-0000-0000-0000-000000000000',
  sessionId: 'cs_test_ALERTCHECK',
  amountCents: 80000,
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    from,
    to,
    subject: `[TEST] [AATC] PAYMENT NOT RECORDED — invoice ${fake.invoiceId}`,
    text:
      'THIS IS A TEST. No payment was taken and nothing is wrong.\n' +
      'Sent by scripts/test-payment-alert.mjs to confirm the alert path works.\n\n' +
      'A real alert looks like this:\n\n' +
      'A Stripe payment succeeded but no invoice row was updated.\n\n' +
      `invoice_id     ${fake.invoiceId}\n` +
      `stripe_session ${fake.sessionId}\n` +
      `amount         $${(fake.amountCents / 100).toFixed(2)}\n\n` +
      'The money is in Stripe. Reconcile the invoice by hand.',
  }),
})

if (!res.ok) {
  console.error(`\nFAILED — HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}
console.log(`\nSent. Check ${to} (including spam).`)
console.log('\nTo exercise the WEBHOOK branch rather than just the email:')
console.log('  stripe listen --forward-to localhost:3000/api/webhooks/stripe')
console.log('  stripe trigger checkout.session.completed \\')
console.log('    --add checkout_session:metadata.invoiceId=00000000-0000-0000-0000-000000000000')
console.log('  Expect: webhook returns 500, alert email arrives, Stripe CLI shows a retry.')
