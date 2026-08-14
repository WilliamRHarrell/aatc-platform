import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { describeBooths } from '@/lib/booth-display'
import { minDepositCents } from '@/lib/pricing'
import { FINAL_DUE_LABEL } from '@/lib/event-config'
import type { Database } from '@/types/database'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'AATC 2027 <onboarding@resend.dev>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// ── Email HTML templates ──────────────────────────────────────

const baseStyle = `
  font-family: Georgia, 'Times New Roman', serif;
  background-color: #0a0a0a;
  color: #ffffff;
  margin: 0;
  padding: 0;
`

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>All American Tattoo Convention</title>
</head>
<body style="${baseStyle}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0 0 8px; font-size:13px; font-weight:700; letter-spacing:4px; text-transform:uppercase; color:#8B7355;">
                ★ ★ ★ ★ ★
              </p>
              <h1 style="margin:0; font-family:Georgia,serif; font-size:28px; font-weight:700; color:#ffffff; letter-spacing:2px;">
                ALL AMERICAN
              </h1>
              <p style="margin:4px 0 0; font-family:Georgia,serif; font-size:18px; font-weight:600; color:#8B7355; letter-spacing:2px;">
                TATTOO CONVENTION
              </p>
              <p style="margin:6px 0 0; font-size:12px; color:#555555; letter-spacing:2px; text-transform:uppercase;">
                April 16–18, 2027 · Fayetteville, NC
              </p>
              <div style="margin:20px auto 0; height:1px; width:120px; background:#8B7355; opacity:0.5;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:16px; padding:36px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0; font-size:12px; color:#444444;">
                All American Tattoo Convention · Crown Complex Event Center · Fayetteville, NC
              </p>
              <p style="margin:4px 0 0; font-size:12px; color:#444444;">
                Questions? Email <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function approvedEmail(businessName: string, exhibitorType: string, boothSize: string, totalAmount: number, depositDueAt: string | null) {
  const dollars = (totalAmount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const minDeposit = minDepositCents(totalAmount)
  const formattedDeadline = depositDueAt
    ? new Date(depositDueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const depositParagraph = formattedDeadline
    ? `<p style="margin:16px 0; font-size:15px; line-height:1.7; color:#cccccc;">
      To secure your booth, please pay at least 25% of the total
      (<strong style="color:#ffffff;">$${(minDeposit / 100).toFixed(2)}</strong>) by <strong style="color:#ffffff;">${formattedDeadline}</strong>.
      The remaining balance is due by <strong style="color:#ffffff;">${FINAL_DUE_LABEL}</strong>.
      If the deposit is not received by the deadline, the booth will be
      released to the next applicant.
    </p>`
    : ''

  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#4ade80;">
      Application Approved
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      You're In, ${businessName}!
    </h2>

    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Congratulations — your <strong style="color:#ffffff;">${exhibitorType}</strong> application for AATC 2027 has been approved.
      We're excited to have you at the Crown Complex Event Center this April.
    </p>

    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Booth size</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px; text-transform:capitalize;">${boothSize} (10×10 ft)</td>
        </tr>
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Invoice total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${dollars}</td>
        </tr>
      </table>
    </div>

    ${depositParagraph}

    <p style="margin:16px 0; font-size:15px; line-height:1.7; color:#cccccc;">
      An invoice has been created in your applicant portal. Please complete payment to secure your booth.
      Booth assignments will be sent after payment is confirmed.
    </p>

    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/portal"
         style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none;
                font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px;
                border-radius:10px;">
        View My Portal →
      </a>
    </p>

    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Reply to this email or contact us at
      <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
    </p>
  `)
}

function rejectedEmail(businessName: string, exhibitorType: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#f87171;">
      Application Update
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Thank You, ${businessName}
    </h2>

    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Thank you for applying to AATC 2027 as an <strong style="color:#ffffff;">${exhibitorType}</strong>.
      We genuinely appreciate your interest in being part of our event.
    </p>

    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      After careful review, we're unable to offer you a spot this year.
      We receive far more applications than we have booths available, and these decisions are never easy.
    </p>

    <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:#cccccc;">
      We encourage you to apply again for future events — we hope to see you at AATC.
    </p>

    <p style="margin:0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Contact us at
      <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
    </p>
  `)
}

function waitlistedEmail(businessName: string, exhibitorType: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#60a5fa;">
      Waitlist Update
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      You're on the Waitlist, ${businessName}
    </h2>

    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Thank you for applying to AATC 2027 as an <strong style="color:#ffffff;">${exhibitorType}</strong>.
      Your application is strong, and we've placed you on our waitlist.
    </p>

    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      If a spot opens up, we'll contact you immediately at this email address.
      No action is required from you — just sit tight.
    </p>

    <p style="margin:0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Contact us at
      <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
    </p>
  `)
}

function depositReminderEmail(businessName: string, depositDueAt: string, minDeposit: number, balance: number, payUrl: string) {
  const dueDate = new Date(depositDueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#eab308;">
      Reminder
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Deposit due ${dueDate}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Your AATC 2027 booth is still being held but your <strong style="color:#ffffff;">25% deposit hasn't been received yet</strong>.
      The deadline is <strong style="color:#ffffff;">${dueDate}</strong> — if we don't have the deposit by then,
      the booth is released to the next applicant.
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999;">Minimum deposit (25%)</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff;">$${(minDeposit / 100).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="font-size:13px; color:#999999; padding-top:8px;">Or pay full balance</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#C4A882; padding-top:8px;">$${(balance / 100).toFixed(2)}</td>
        </tr>
      </table>
    </div>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${payUrl}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">
        Pay Now →
      </a>
    </p>
  `)
}

function finalReminderEmail(businessName: string, daysRemaining: number, balance: number, payUrl: string) {
  const tagline = daysRemaining === 1 ? 'final reminder' : `${daysRemaining} days left`
  const message = daysRemaining === 1
    ? 'This is your final reminder — payment is due tomorrow.'
    : `That's ${daysRemaining} days from now.`
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:${daysRemaining <= 7 ? '#f87171' : '#eab308'};">
      ${tagline}
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Balance due ${FINAL_DUE_LABEL}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Your AATC 2027 booth balance of <strong style="color:#ffffff;">$${(balance / 100).toFixed(2)}</strong>
      is due by <strong style="color:#ffffff;">${FINAL_DUE_LABEL}</strong>. ${message}
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      If the balance isn't paid by January 1, the booth will be canceled and your deposit will be forfeited.
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${payUrl}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">
        Pay Balance →
      </a>
    </p>
  `)
}

function expirationEmail(businessName: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#f87171;">
      Booth Released
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Your AATC 2027 booth has been released
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Unfortunately, the 25% deposit deadline passed without payment, so your booth has been released
      to the next applicant on the list.
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      If you'd still like to be part of AATC 2027, please reapply at
      <a href="${SITE_URL}/apply" style="color:#C4A882;">${SITE_URL}/apply</a> — pending availability.
    </p>
  `)
}

function cancellationEmail(businessName: string, depositForfeited: number) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#f87171;">
      Booth Canceled
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Your AATC 2027 booth has been canceled
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      The ${FINAL_DUE_LABEL} deadline for the remaining balance has passed. Per the terms accepted at deposit,
      the booth has been canceled and the deposit (<strong style="color:#ffffff;">$${(depositForfeited / 100).toFixed(2)}</strong>) is forfeited.
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      If you have questions, please reply to this email.
    </p>
  `)
}

function sponsorApprovedEmail(sponsorName: string, tier: string, amount: number) {
  const dollars = (amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const tierLabel = tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#ffd700;">
      Sponsorship Confirmed
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Welcome Aboard, ${sponsorName}!
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Your <strong style="color:#ffffff;">${tierLabel}</strong> sponsorship for AATC 2027 has been confirmed.
      Thank you for supporting our tattooed military community!
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Sponsorship level</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px;">${tierLabel}</td>
        </tr>
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Invoice total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${dollars}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0; font-size:15px; line-height:1.7; color:#cccccc;">
      To view your invoice and complete payment, create your account using the email address you applied with:
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/auth/login?redirect=/portal"
         style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none;
                font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px;
                border-radius:10px;">
        Create Account &amp; View Invoice →
      </a>
    </p>
    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Reply to this email or contact us at
      <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
    </p>
  `)
}

function returnerInviteEmail(businessName: string, loginUrl: string, resetUrl: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#4ade80;">
      Welcome Back
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Your AATC 2027 booth is reserved
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Thanks for paying in full at 2026 pricing during the early-bird window. Your AATC 2027 booth is locked in —
      no further payment is required.
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      To finish setting up your account, you need to:
    </p>
    <ol style="margin:0 0 16px; padding-left:20px; font-size:15px; line-height:1.7; color:#cccccc;">
      <li><a href="${resetUrl}" style="color:#C4A882;">Set a password</a> for your account</li>
      <li>Sign in and complete your <strong style="color:#ffffff;">artist roster</strong> (names + IDs for everyone working your booth)</li>
    </ol>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Once your roster is complete, your booth will appear in the public exhibitor directory.
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${resetUrl}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">
        Set My Password →
      </a>
    </p>
    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Already have a password? <a href="${loginUrl}" style="color:#8B7355;">Sign in here</a>.
    </p>
  `)
}

// ── Route handler ─────────────────────────────────────────────

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

    // Allow trusted cron callers via shared secret (lifecycle-sweep, etc.)
    const cronSecret = req.headers.get('x-cron-secret')
    const isCronCaller = !!cronSecret && cronSecret === process.env.CRON_SECRET

    if (!isCronCaller) {
      // Verify admin session
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // EVERY data read below uses the service role, never `supabase` above.
    //
    // `supabase` is request-scoped, and a cron caller has no session — so it
    // reads as anon. Once invoice reads were restricted to owners (029) and anon
    // lost SELECT on sponsorships (038), any lookup through it returned nothing,
    // and deposit_reminder, final_reminder and sponsor_approved all failed. The
    // lifecycle sweep does not check the response, so booths would have been
    // released having sent no warning at all.
    //
    // `supabase` is for AUTH ONLY — it establishes who is calling. Authorisation
    // is enforced above; these reads are deliberately privileged so we can email
    // people whose rows are hidden from public reads (needs_roster, expired,
    // canceled, pending sponsors).
    const adminFetchClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { applicationId, sponsorshipId, status, kind, daysRemaining, depositForfeited } = await req.json() as {
      applicationId?: string
      sponsorshipId?: string
      status?: 'approved' | 'rejected' | 'waitlisted'
      kind?: 'approved' | 'rejected' | 'waitlisted' | 'deposit_reminder' | 'final_reminder' | 'expiration' | 'cancellation' | 'returner_invite'
      daysRemaining?: number
      depositForfeited?: number
    }

    if (sponsorshipId) {
      // SERVICE ROLE, DELIBERATELY — do not "tidy" this back to `supabase`.
      // The caller is already authenticated at the top of this route (admin
      // session or valid x-cron-secret), so RLS here is redundant. Worse, a
      // cron caller has no session, so the request-scoped client reads as anon
      // and this returns nothing.
      const { data: spon } = await adminFetchClient
        .from('sponsorships')
        .select('sponsor_name, email, tier, amount')
        .eq('id', sponsorshipId)
        .single()

      if (!spon || !spon.email) {
        return NextResponse.json({ error: 'Sponsorship not found or no email' }, { status: 404 })
      }

      const subject = `🎉 Your AATC 2027 sponsorship is confirmed — ${spon.sponsor_name}`
      const html = sponsorApprovedEmail(spon.sponsor_name, spon.tier, spon.amount)

      const { error } = await resend.emails.send({
        from: FROM,
        to: spon.email,
        subject,
        html,
      })

      if (error) {
        console.error('Resend error:', error)
        return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Resolve the kind: explicit param takes priority; fall back to legacy `status`.
    const resolvedKind = kind ?? status

    if (!applicationId || !resolvedKind) {
      return NextResponse.json({ error: 'Missing applicationId or kind/status' }, { status: 400 })
    }

    // SERVICE ROLE, DELIBERATELY — do not "tidy" this back to `supabase`.
    // The caller is already authenticated at the top of this route (admin
    // session or valid x-cron-secret), so RLS here is redundant. Worse, a
    // cron caller has no session, so the request-scoped client reads as anon
    // and this returns nothing.
    const { data: app } = await adminFetchClient
      .from('applications')
      .select('business_name, email, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, total_amount, deposit_due_at')
      .eq('id', applicationId)
      .single()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Build email
    let subject: string
    let html: string

    if (resolvedKind === 'approved') {
      subject = `🎉 Your AATC 2027 application is approved — ${app.business_name}`
      html = approvedEmail(app.business_name, app.exhibitor_type, describeBooths(app), app.total_amount, app.deposit_due_at)
    } else if (resolvedKind === 'rejected') {
      subject = `Update on your AATC 2027 application — ${app.business_name}`
      html = rejectedEmail(app.business_name, app.exhibitor_type)
    } else if (resolvedKind === 'waitlisted') {
      subject = `You're on the AATC 2027 waitlist — ${app.business_name}`
      html = waitlistedEmail(app.business_name, app.exhibitor_type)
    } else if (resolvedKind === 'deposit_reminder') {
        // SERVICE ROLE, DELIBERATELY — do not "tidy" this back to `supabase`.
        // The caller is authenticated at the top of this route (admin session
        // or valid x-cron-secret), so RLS here is redundant. Worse, a cron
        // caller has no session, so the request-scoped client reads as anon and
        // this returns nothing — which is how deposit_reminder and
        // final_reminder silently failed.
      const { data: inv } = await adminFetchClient
        .from('invoices')
        .select('id, amount, amount_paid')
        .eq('application_id', applicationId)
        .maybeSingle()
      if (!app.deposit_due_at || !inv) {
        return NextResponse.json({ error: 'Cannot send deposit reminder — missing deposit_due_at or invoice' }, { status: 400 })
      }
      const balance = inv.amount - (inv.amount_paid ?? 0)
      const minDeposit = minDepositCents(inv.amount)
      const payUrl = `${SITE_URL}/portal/pay?invoice=${inv.id}`
      subject = `Reminder: AATC 2027 deposit due — ${app.business_name}`
      html = depositReminderEmail(app.business_name, app.deposit_due_at, minDeposit, balance, payUrl)
    } else if (resolvedKind === 'final_reminder') {
      const days = daysRemaining ?? 0
        // SERVICE ROLE, DELIBERATELY — do not "tidy" this back to `supabase`.
        // The caller is authenticated at the top of this route (admin session
        // or valid x-cron-secret), so RLS here is redundant. Worse, a cron
        // caller has no session, so the request-scoped client reads as anon and
        // this returns nothing — which is how deposit_reminder and
        // final_reminder silently failed.
      const { data: inv } = await adminFetchClient
        .from('invoices')
        .select('id, amount, amount_paid')
        .eq('application_id', applicationId)
        .maybeSingle()
      if (!inv) {
        return NextResponse.json({ error: 'No invoice found for final reminder' }, { status: 400 })
      }
      const balance = inv.amount - (inv.amount_paid ?? 0)
      const payUrl = `${SITE_URL}/portal/pay?invoice=${inv.id}`
      subject = `${days} day${days === 1 ? '' : 's'} until your AATC 2027 balance is due — ${app.business_name}`
      html = finalReminderEmail(app.business_name, days, balance, payUrl)
    } else if (resolvedKind === 'expiration') {
      subject = `Your AATC 2027 booth has been released — ${app.business_name}`
      html = expirationEmail(app.business_name)
    } else if (resolvedKind === 'cancellation') {
      const forfeited = depositForfeited ?? 0
      subject = `Your AATC 2027 booth has been canceled — ${app.business_name}`
      html = cancellationEmail(app.business_name, forfeited)
    } else if (resolvedKind === 'returner_invite') {
      const adminClient = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: app.email,
        options: { redirectTo: `${SITE_URL}/auth/reset-password` },
      })
      const resetUrl = linkData?.properties?.action_link ?? `${SITE_URL}/auth/forgot-password`
      const loginUrl = `${SITE_URL}/auth/login`
      subject = `Welcome back to AATC 2027 — ${app.business_name}`
      html = returnerInviteEmail(app.business_name, loginUrl, resetUrl)
    } else {
      return NextResponse.json({ error: `Unknown kind: ${resolvedKind}` }, { status: 400 })
    }

    const { error } = await resend.emails.send({
      from: FROM,
      to: app.email,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: 'Email failed to send', detail: error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-email route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
