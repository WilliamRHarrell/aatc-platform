/**
 * Transactional email: the shared wrapper and the templates that more than
 * one route sends. /api/send-email keeps its lifecycle templates; the intake
 * routes (/api/sponsor-apply, /api/pinup-entry) use these.
 *
 * Money in these templates is the tier price from SPONSOR_TIERS, never a
 * client value. The internal notices go to CONTACT_EMAIL (one home).
 */
import { CONTACT_EMAIL, FINAL_DUE_LABEL } from '@/lib/event-config'
import { SPONSOR_TIERS, sponsorLines, type ShownPrices, type SponsorTier } from '@/lib/sponsor-tiers'
import type { ReceiptFacts } from '@/lib/application-receipt'
import { formatDateOnly } from '@/lib/date-only'

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

/**
 * To the sponsor, on submission. No invoice, no deadline: nothing is confirmed yet.
 *
 * Line by line, priced only where the tier's price is shown (084); a hidden
 * package reads `followUp` and there is no total, which would reveal it by
 * subtraction. The list price is still on the row and in the internal notice.
 */
export function sponsorReceivedEmail(sponsorName: string, tier: SponsorTier, items: SponsorTier[], shown: ShownPrices, followUp: string) {
  const { lines, total } = sponsorLines(tier, items, shown)
  const cell = 'font-size:13px; padding:4px 0;'
  const rows = lines.map(l => `
        <tr>
          <td style="${cell} color:#ffffff;">${esc(l.label)}</td>
          <td align="right" style="${cell} ${l.amount === null ? 'color:#999999;">' + esc(followUp) : 'font-weight:600; color:#C4A882;">' + dollars(l.amount)}</td>
        </tr>`).join('')
  const totalRow = total === null ? '' : `
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${dollars(total)}</td>
        </tr>`
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
      <p style="margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#999999;">Requested</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}${totalRow}
      </table>
    </div>
    <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#cccccc;">
      Nothing is due yet. Once our team confirms your sponsorship you will receive a confirmation email with your invoice.
    </p>
  `)
}

/**
 * To CONTACT_EMAIL, for each new sponsor application. INTERNAL: always the
 * list price, hidden or not - it is the default amount the invoice starts from.
 */
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

/**
 * Sponsor balance reminder, 30 or 7 days before the invoice's due_date (081).
 * A reminder only: it states the balance and the date and never threatens a
 * consequence, because none exists - a sponsorship is not expired for being
 * late. The date is a DATE column, formatted without a time zone shift.
 */
export function sponsorDueReminderEmail(v: { sponsorName: string; balanceCents: number; dueDate: string; daysOut: 30 | 7; hasAccount: boolean }) {
  const due = formatDateOnly(v.dueDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const balance = `$${(v.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Sponsorship balance
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      ${v.daysOut === 7 ? 'Due in a week' : 'Due in 30 days'}, ${esc(v.sponsorName)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      A reminder that the remaining balance on your AATC 2027 sponsorship is due
      <strong style="color:#ffffff;">${due}</strong>. Thank you for supporting the show.
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999;">Balance due</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882;">${balance}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#cccccc;">
      ${v.hasAccount
        ? 'You can pay any amount toward it online from your sponsor portal.'
        : `To pay online through the sponsor portal, email <a href="mailto:${CONTACT_EMAIL}" style="color:#8B7355;">${CONTACT_EMAIL}</a> and we will connect your account to your sponsorship.`}
    </p>
    ${v.hasAccount ? `<p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/portal" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">Open My Portal →</a>
    </p>` : ''}
  `)
}

/**
 * Supabase Auth email templates (4c). Supabase sends these itself, through the
 * custom SMTP (Resend), so they are pasted into Dashboard -> Authentication ->
 * Email Templates; they are not sent by this app. The HTML is GENERATED from
 * emailWrapper so the branding has one home: auth-email-templates.test.ts
 * writes supabase/templates/*.html and fails when a committed file is stale
 * (WRITE_AUTH_TEMPLATES=1 regenerates). {{ .ConfirmationURL }} is Supabase's
 * Go-template variable, left literal on purpose.
 */
const AUTH_URL = '{{ .ConfirmationURL }}'

function authButtonBlock(label: string) {
  return `<p style="margin:28px 0 0; text-align:center;">
      <a href="${AUTH_URL}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">${label}</a>
    </p>
    <p style="margin:24px 0 0; font-size:12px; line-height:1.6; color:#777777; word-break:break-all;">
      If the button does not work, paste this link into your browser:<br />
      <a href="${AUTH_URL}" style="color:#8B7355;">${AUTH_URL}</a>
    </p>`
}

export function authConfirmSignupEmail() {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Confirm your email
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Welcome to AATC 2027
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Thanks for creating your All American Tattoo Convention account. Confirm this
      email address to finish setting up your portal, where you apply, pay and
      manage everything for the show.
    </p>
    ${authButtonBlock('Confirm My Email →')}
    <p style="margin:24px 0 0; font-size:13px; line-height:1.6; color:#999999;">
      If you did not create an account, you can ignore this email.
    </p>
  `)
}

export function authResetPasswordEmail() {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Password reset
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Choose a new password
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We received a request to reset the password for your AATC 2027 portal account.
      The link works once and expires after a short time.
    </p>
    ${authButtonBlock('Choose a New Password →')}
    <p style="margin:24px 0 0; font-size:13px; line-height:1.6; color:#999999;">
      If you did not ask for this, ignore this email and your password will not change.
    </p>
  `)
}

// ── Invite & link (admin action, /api/admin/invite-link) ──────
// `what` names the thing now in their portal: "sponsorship" or "booth application".

const ctaButton = (href: string, label: string) => `
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${href}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">${label}</a>
    </p>`

const contactLine = `
    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Reply to this email or contact us at
      <a href="mailto:${CONTACT_EMAIL}" style="color:#8B7355;">${CONTACT_EMAIL}</a>
    </p>`

/**
 * No account yet: an invitation to create one. `actionUrl` is a single-use
 * Supabase link that signs them in and lands on the set-password page; the
 * account is already linked, so the portal shows their record straight away.
 */
export function accountInviteEmail(v: { name: string; what: string; actionUrl: string }) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Your AATC Portal
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Set up your account, ${esc(v.name)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We have created a portal account for you and connected it to your AATC 2027 ${esc(v.what)}.
      Choose a password to sign in. From the portal you can see your details and any invoice, and pay online.
    </p>
    ${ctaButton(esc(v.actionUrl), 'Set Your Password →')}
    <p style="margin:16px 0 0; font-size:13px; line-height:1.7; color:#999999; text-align:center;">
      This link works once and expires. If it has expired, use "Forgot password" on the sign-in page with this email address.
    </p>
    ${contactLine}
  `)
}

/** An existing account was linked: tell them where to look. */
export function portalLinkedEmail(v: { name: string; what: string }) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      Your AATC Portal
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Your ${esc(v.what)} is in your portal
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We have connected the AATC 2027 ${esc(v.what)} for <strong style="color:#ffffff;">${esc(v.name)}</strong> to your account.
      Sign in to see its details and any invoice, and to pay online.
    </p>
    ${ctaButton(`${SITE_URL}/auth/login?redirect=/portal`, 'Go to Your Portal →')}
    ${contactLine}
  `)
}

// ── Food truck applications (/api/food-truck-apply, 091) ──────

const kicker = (label: string) => `
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#C4A882;">
      ${label}
    </p>`

/** Content-editor text: plain paragraphs separated by a blank line, escaped. */
function paragraphs(text: string) {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">${esc(p).replace(/\n/g, '<br />')}</p>`).join('')
}

export interface FoodTruckFacts { truckName: string; contactName: string; cuisine: string; days: string; price: number }

function truckFactsTable(f: FoodTruckFacts) {
  return `
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
        <tr><td style="padding:4px 0; color:#999999;">Food truck</td><td align="right" style="color:#ffffff;">${esc(f.truckName)}</td></tr>
        <tr><td style="padding:4px 0; color:#999999;">Food</td><td align="right">${esc(f.cuisine)}</td></tr>
        <tr><td style="padding:4px 0; color:#999999;">Days</td><td align="right">${esc(f.days)}</td></tr>
        <tr><td style="padding:4px 0; color:#999999;">Fee for those days</td><td align="right" style="font-weight:700; color:#C4A882;">${dollars(f.price)}</td></tr>
      </table>
    </div>`
}

/** To the applicant, right after the form saves. Nothing is due yet. */
export function foodTruckReceivedEmail(f: FoodTruckFacts) {
  return emailWrapper(`
    ${kicker('Application Received')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Thank you, ${esc(f.contactName)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      We received your food truck application for the Food Truck Rodeo at AATC 2027. We review applications for a good mix of food and will email you with our decision.
    </p>
    ${truckFactsTable(f)}
    <p style="margin:16px 0 0; font-size:15px; line-height:1.7; color:#cccccc;">
      Nothing is due now. If your truck is selected, we will email you a link to set up your account and pay.
    </p>
  `)
}

/** To CONTACT_EMAIL, for each new food truck application. */
export function internalNewFoodTruckEmail(f: FoodTruckFacts & { email: string; phone: string; photoCount: number; hasLogo: boolean; hasPermit: boolean; hasLicense: boolean; description: string }) {
  return emailWrapper(`
    ${kicker('New Food Truck Application')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${esc(f.truckName)}
    </h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
      <tr><td style="padding:4px 0; color:#999999;">Contact</td><td align="right">${esc(f.contactName)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Email</td><td align="right"><a href="mailto:${esc(f.email)}" style="color:#C4A882;">${esc(f.email)}</a></td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Phone</td><td align="right">${esc(f.phone)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Food</td><td align="right">${esc(f.cuisine)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Days</td><td align="right">${esc(f.days)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Fee</td><td align="right" style="color:#C4A882; font-weight:700;">${dollars(f.price)}</td></tr>
      <tr><td style="padding:4px 0; color:#999999;">Files sent</td><td align="right">${[f.hasLogo ? 'logo' : '', `${f.photoCount} photo${f.photoCount === 1 ? '' : 's'}`, f.hasPermit ? 'health permit' : '', f.hasLicense ? 'business license' : ''].filter(Boolean).join(', ')} (uploading after this email)</td></tr>
    </table>
    ${f.description ? `<p style="margin:16px 0 0; font-size:14px; line-height:1.6; color:#cccccc;"><span style="color:#999999;">Menu:</span> ${esc(f.description)}</p>` : ''}
    ${ctaButton(`${SITE_URL}/admin/food-trucks`, 'Review in admin →')}
  `)
}

/**
 * Ryan's decision 3: selection and the account invitation are ONE email. The
 * copy is the content editor's; the amounts and the due date are added here
 * from their one home. `actionUrl` is the single-use set-password link for a
 * new account; without it the truck already has an account and gets the
 * portal link.
 */
export function foodTruckSelectedEmail(v: { body: string; facts: FoodTruckFacts; depositCents: number; actionUrl: string | null }) {
  const first = Math.min(v.depositCents, v.facts.price)
  return emailWrapper(`
    ${kicker('Food Truck Rodeo')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      ${esc(v.facts.truckName)} is selected
    </h2>
    ${paragraphs(v.body)}
    ${truckFactsTable(v.facts)}
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      ${first < v.facts.price
        ? `A first payment of <strong style="color:#ffffff;">${dollars(first)}</strong> holds your space. The full ${dollars(v.facts.price)} is due by <strong style="color:#ffffff;">${esc(FINAL_DUE_LABEL)}</strong> to confirm it.`
        : `The full ${dollars(v.facts.price)} is due by <strong style="color:#ffffff;">${esc(FINAL_DUE_LABEL)}</strong> to confirm your spot.`}
    </p>
    ${v.actionUrl
      ? `${ctaButton(esc(v.actionUrl), 'Set Up Your Account →')}
    <p style="margin:16px 0 0; font-size:13px; line-height:1.7; color:#999999; text-align:center;">
      This link works once and expires. If it has expired, use "Forgot password" on the sign-in page with this email address.
    </p>`
      : ctaButton(`${SITE_URL}/auth/login?redirect=/portal`, 'Go to Your Portal →')}
    ${contactLine}
  `)
}

/** Waitlisted or not selected: the content editor's copy, nothing else. */
export function foodTruckDecisionEmail(v: { truckName: string; contactName: string; body: string }) {
  return emailWrapper(`
    ${kicker('Food Truck Rodeo')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      Hi ${esc(v.contactName)},
    </h2>
    <p style="margin:0 0 16px; font-size:13px; color:#999999;">About ${esc(v.truckName)}</p>
    ${paragraphs(v.body)}
    ${contactLine}
  `)
}

/**
 * Food truck balance reminder, 30/14/7/1 days before the due date (092). The
 * copy is the content editor's; the balance, the due date and the pay link
 * are added here. A truck with no portal account is told how to get one.
 */
export function foodTruckReminderEmail(v: { truckName: string; contactName: string; body: string; balanceCents: number; daysOut: number; hasAccount: boolean }) {
  return emailWrapper(`
    ${kicker('Food Truck Rodeo')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      ${v.daysOut === 1 ? 'Due tomorrow' : `Due in ${v.daysOut} days`}, ${esc(v.contactName)}
    </h2>
    <p style="margin:0 0 16px; font-size:13px; color:#999999;">About ${esc(v.truckName)}</p>
    ${paragraphs(v.body)}
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc;">
        <tr><td style="padding:4px 0; color:#999999;">Balance</td><td align="right" style="font-size:16px; font-weight:700; color:#C4A882;">${dollars(v.balanceCents)}</td></tr>
        <tr><td style="padding:4px 0; color:#999999;">Due by</td><td align="right" style="color:#ffffff;">${esc(FINAL_DUE_LABEL)}</td></tr>
      </table>
    </div>
    ${v.hasAccount
      ? ctaButton(`${SITE_URL}/auth/login?redirect=/portal`, 'Pay in Your Portal →')
      : `<p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">To pay online, email <a href="mailto:${CONTACT_EMAIL}" style="color:#8B7355;">${CONTACT_EMAIL}</a> and we will set up your portal account.</p>`}
    ${contactLine}
  `)
}

export interface UnpaidTruckLine { truckName: string; contactName: string; email: string; paidCents: number; amountCents: number }

/** To CONTACT_EMAIL, once, the day after the due date (092): selected trucks not paid in full. */
export function internalFoodTrucksUnpaidEmail(v: { depositOnly: UnpaidTruckLine[]; nothingPaid: UnpaidTruckLine[] }) {
  const table = (rows: UnpaidTruckLine[]) => rows.length === 0
    ? '<p style="margin:0 0 16px; font-size:14px; color:#999999;">None.</p>'
    : `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px; color:#cccccc; margin:0 0 20px;">
        ${rows.map(r => `<tr>
          <td style="padding:6px 0; border-bottom:1px solid #2a2a2a;"><span style="color:#ffffff;">${esc(r.truckName)}</span><br /><span style="font-size:12px; color:#999999;">${esc(r.contactName)} · <a href="mailto:${esc(r.email)}" style="color:#C4A882;">${esc(r.email)}</a></span></td>
          <td align="right" style="padding:6px 0; border-bottom:1px solid #2a2a2a; white-space:nowrap;">${dollars(r.paidCents)} of ${dollars(r.amountCents)}<br /><span style="font-size:12px; color:#f87171;">${dollars(r.amountCents - r.paidCents)} owed</span></td>
        </tr>`).join('')}
      </table>`
  return emailWrapper(`
    ${kicker('Food Trucks Not Paid in Full')}
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:24px; font-weight:700; color:#ffffff;">
      Balance was due ${esc(FINAL_DUE_LABEL)}
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Selected food trucks that have not paid in full. Nothing has been cancelled; release a truck in admin to free its spot.
    </p>
    <h3 style="margin:16px 0 8px; font-size:14px; letter-spacing:2px; text-transform:uppercase; color:#C4A882;">Deposit only (${v.depositOnly.length})</h3>
    ${table(v.depositOnly)}
    <h3 style="margin:16px 0 8px; font-size:14px; letter-spacing:2px; text-transform:uppercase; color:#C4A882;">Nothing paid (${v.nothingPaid.length})</h3>
    ${table(v.nothingPaid)}
    ${ctaButton(`${SITE_URL}/admin/food-trucks`, 'Open Food Trucks in admin →')}
  `)
}
