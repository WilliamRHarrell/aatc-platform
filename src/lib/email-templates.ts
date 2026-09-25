/**
 * Transactional email: the shared wrapper and the templates that more than
 * one route sends. /api/send-email keeps its lifecycle templates; the intake
 * routes (/api/sponsor-apply, /api/pinup-entry) use these.
 *
 * Money in these templates is the tier price from SPONSOR_TIERS, never a
 * client value. The internal notices go to CONTACT_EMAIL (one home).
 */
import { CONTACT_EMAIL } from '@/lib/event-config'
import { SPONSOR_TIERS, type SponsorTier } from '@/lib/sponsor-tiers'
import type { ReceiptFacts } from '@/lib/application-receipt'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const baseStyle = `
  font-family: Georgia, 'Times New Roman', serif;
  background-color: #0a0a0a;
  color: #ffffff;
  margin: 0;
  padding: 0;
`

export function emailWrapper(content: string) {
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
                April 16-18, 2027 · Fayetteville, NC
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
                Questions? Email <a href="mailto:${CONTACT_EMAIL}" style="color:#8B7355;">${CONTACT_EMAIL}</a>
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

const dollars = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function describeSponsorship(tier: SponsorTier, items: SponsorTier[]): string {
  const main = SPONSOR_TIERS[tier].group === 'main' ? SPONSOR_TIERS[tier].label : null
  const extras = items.filter(i => i !== tier || !main).map(i => SPONSOR_TIERS[i].label)
  return [main, ...extras].filter(Boolean).join(' + ')
}

/** To the sponsor, on submission. No invoice, no deadline: nothing is confirmed yet. */
export function sponsorReceivedEmail(sponsorName: string, tier: SponsorTier, items: SponsorTier[], amount: number) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Application Received
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Thank you, ${esc(sponsorName)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We received your sponsorship application for AATC 2027 and will be in touch shortly to confirm the details.
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Requested</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px;">${esc(describeSponsorship(tier, items))}</td>
        </tr>
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Package total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${dollars(amount)}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#cccccc;">
      Nothing is due yet. Once our team confirms your sponsorship you will receive a confirmation email with your invoice.
    </p>
  `)
}

/** To CONTACT_EMAIL, for each new sponsor application. */
export function internalNewSponsorEmail(v: { sponsorName: string; contactName: string; email: string; phone: string | null; tier: SponsorTier; items: SponsorTier[]; amount: number; notes: string | null }) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      New Sponsor Application
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${esc(v.sponsorName)}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
      <tr><td style="padding:4px 0; color:#999999;">Contact</td><td align="right">${esc(v.contactName)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Email</td><td align="right"><a href="mailto:${esc(v.email)}" style="color:#C4A882;">${esc(v.email)}</a></td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Phone</td><td align="right">${v.phone ? esc(v.phone) : '-'}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Requested</td><td align="right">${esc(describeSponsorship(v.tier, v.items))}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Package total</td><td align="right" style="color:#C4A882; font-weight:700;">${dollars(v.amount)}</td></tr>
    </table>
    ${v.notes ? `<p style="margin:16px 0 0; font-size:14px; line-height:1.6; color:#cccccc;"><span style="color:#999999;">Notes:</span> ${esc(v.notes)}</p>` : ''}
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/admin/sponsorships" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:12px 28px; border-radius:10px;">Review in admin →</a>
    </p>
  `)
}

/** To CONTACT_EMAIL, for each new pinup registration. */
export function internalNewPinupEmail(v: { fullName: string; stageName: string | null; email: string; phone: string; status: 'confirmed' | 'waitlist'; queuePosition: number | null; capacity: number | null }) {
  const place = v.status === 'confirmed' ? 'CONFIRMED' : 'WAITLIST'
  const where = v.queuePosition != null && v.capacity != null ? ` (entry ${v.queuePosition} of ${v.capacity})` : ''
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      New Pinup Registration
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${esc(v.fullName)}${v.stageName ? ` <span style="color:#999999; font-size:16px;">as ${esc(v.stageName)}</span>` : ''}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
      <tr><td style="padding:4px 0; color:#999999;">Status</td><td align="right" style="font-weight:700; color:${v.status === 'confirmed' ? '#4ade80' : '#eab308'};">${place}${where}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Email</td><td align="right"><a href="mailto:${esc(v.email)}" style="color:#C4A882;">${esc(v.email)}</a></td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Phone</td><td align="right">${esc(v.phone)}</td></tr>
    </table>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/admin/pinup" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:12px 28px; border-radius:10px;">Open the entry list →</a>
    </p>
  `)
}

// ── Booth applications (PR 1b) ────────────────────────────────

/** To the applicant, right after the form saves. No status, no dates, no payment ask. */
export function applicationReceivedEmail(f: ReceiptFacts) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Application Received
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Thank you, ${esc(f.businessName)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We received your <strong style="color:#ffffff;">${f.kind.toLowerCase()}</strong> booth application for AATC 2027.
      Our team reviews every application and will email you with a decision.
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Booth</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px;">${esc(f.booths)}</td>
        </tr>
        ${f.kind === 'Artist' ? `<tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Artists</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px;">${f.artistCount}</td>
        </tr>` : ''}
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Application total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${f.total}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#cccccc;">
      Nothing is due now. If approved, your invoice and deposit deadline arrive with the approval email.
      You can check your application any time in your portal.
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/portal" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">View My Portal →</a>
    </p>
  `)
}

/** To CONTACT_EMAIL, for each new booth application. */
export function internalNewApplicationEmail(f: ReceiptFacts, applicationId: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      New ${f.kind} Application
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${esc(f.businessName)}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
      <tr><td style="padding:4px 0; color:#999999;">Contact</td><td align="right">${esc(f.contactName)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Email</td><td align="right"><a href="mailto:${esc(f.email)}" style="color:#C4A882;">${esc(f.email)}</a></td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Phone</td><td align="right">${f.phone ? esc(f.phone) : '-'}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Booth</td><td align="right">${esc(f.booths)}</td></tr>
      ${f.kind === 'Artist' ? `<tr><td style="padding:4px 0; color:#999999;">Artists</td><td align="right">${f.artistCount}</td></tr>` : ''}
      <tr><td style="padding:4px 0; color:#999999;">Veteran discount</td><td align="right" style="color:${f.veteranClaimed ? '#eab308' : '#cccccc'};">${f.veteranClaimed ? 'CLAIMED - verify the document' : 'not claimed'}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Total</td><td align="right" style="color:#C4A882; font-weight:700;">${f.total}</td></tr>
    </table>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/admin/applications?open=${encodeURIComponent(applicationId)}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:12px 28px; border-radius:10px;">Review in admin →</a>
    </p>
  `)
}

// ── Panel registrations (PR 1b) ───────────────────────────────
export function panelRegisteredEmail(name: string, panelTitle: string, mode: 'free' | 'invoice') {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      ${mode === 'free' ? 'Registration Received' : 'Registration Started'}
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      ${esc(panelTitle)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${esc(name)}, ${mode === 'free'
        ? 'you are registered. We will email you if anything about the session changes. Walk-ins are welcome too, so bring a friend.'
        : 'your registration is saved and will be confirmed once payment completes. If you closed the payment page, reply to this email and we will send a new link.'}
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/events/tattoo-panels" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">Seminar details →</a>
    </p>
  `)
}

export function internalNewPanelRegistrationEmail(v: { name: string; email: string; phone: string | null; panelTitle: string; attendeeType: string; mode: 'free' | 'invoice' }) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      New Seminar Registration
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${esc(v.panelTitle)}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
      <tr><td style="padding:4px 0; color:#999999;">Name</td><td align="right">${esc(v.name)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Email</td><td align="right"><a href="mailto:${esc(v.email)}" style="color:#C4A882;">${esc(v.email)}</a></td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Phone</td><td align="right">${v.phone ? esc(v.phone) : '-'}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Attendee type</td><td align="right">${esc(v.attendeeType)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Payment</td><td align="right">${v.mode === 'free' ? 'free registration' : 'invoice - pending Stripe payment'}</td></tr>
    </table>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/admin/panels" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:12px 28px; border-radius:10px;">Open panels →</a>
    </p>
  `)
}
