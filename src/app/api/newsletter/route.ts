import { NextRequest, NextResponse } from 'next/server'
import { botTrapRejection } from '@/lib/bot-trap'
import { normaliseEmail, subscribeToNewsletter } from '@/lib/ghl'

// POST /api/newsletter - the footer's newsletter signup, into GoHighLevel
// (lib/ghl.ts: upsert the contact, then add the "newsletter" tag). Replaces
// the Mailchimp signup the design handoff assumed; the site had no Mailchimp
// code.
//
// Body: { email, website (honeypot, must be empty), elapsedMs }.
//
// NOT RATE LIMITED - same standing gap as the other public form routes
// (docs/handoff/open-items.md: Vercel WAF rules before launch).

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Could not read that. Please try again.' }, { status: 400 })

  const trap = botTrapRejection(body)
  if (trap) {
    console.warn(`[newsletter] rejected as automated: ${trap}`)
    return NextResponse.json({ error: 'We could not verify that signup. Please try again.' }, { status: 400 })
  }

  const email = normaliseEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const r = await subscribeToNewsletter(email)
  if (!r.ok && r.reason === 'not_configured') {
    console.error('[newsletter] GHL_API_TOKEN or GHL_LOCATION_ID is not set; signup refused')
    return NextResponse.json({ error: 'Newsletter signup is not available right now. Please try again later.' }, { status: 503 })
  }
  if (!r.ok) {
    console.error(`[newsletter] GHL signup failed: ${r.detail}`)
    return NextResponse.json({ error: 'We could not sign you up just now. Please try again.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
