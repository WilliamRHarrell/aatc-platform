import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
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

function approvedEmail(businessName: string, exhibitorType: string, boothSize: string, totalAmount: number) {
  const dollars = (totalAmount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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

    const { applicationId, sponsorshipId, status } = await req.json() as {
      applicationId?: string
      sponsorshipId?: string
      status: 'approved' | 'rejected' | 'waitlisted'
    }

    if (sponsorshipId) {
      const { data: spon } = await supabase
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

    if (!applicationId || !status) {
      return NextResponse.json({ error: 'Missing applicationId or status' }, { status: 400 })
    }

    // Fetch application details
    const { data: app } = await supabase
      .from('applications')
      .select('business_name, email, exhibitor_type, booth_size, total_amount')
      .eq('id', applicationId)
      .single()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Build email
    let subject: string
    let html: string

    if (status === 'approved') {
      subject = `🎉 Your AATC 2027 application is approved — ${app.business_name}`
      html = approvedEmail(app.business_name, app.exhibitor_type, app.booth_size, app.total_amount)
    } else if (status === 'rejected') {
      subject = `Update on your AATC 2027 application — ${app.business_name}`
      html = rejectedEmail(app.business_name, app.exhibitor_type)
    } else {
      subject = `You're on the AATC 2027 waitlist — ${app.business_name}`
      html = waitlistedEmail(app.business_name, app.exhibitor_type)
    }

    const { error } = await resend.emails.send({
      from: FROM,
      to: app.email,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-email route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
