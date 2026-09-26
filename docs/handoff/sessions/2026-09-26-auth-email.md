# Session 2026-09-26: branded auth emails and deliverability (4c)

**Delivered.** Branch `feat/auth-email-templates`. No migration.

- `supabase/templates/confirm_signup.html`, `reset_password.html`: generated
  from `src/lib/email-templates.ts` (one home for the branding); a vitest
  fails if they go stale. Ryan pastes them into Supabase -> Authentication ->
  Email Templates with the subjects in `supabase/templates/README.md`.
  Supabase Auth already sends through custom SMTP (Resend) - Ryan, 2026-09-26.
- `scripts/check-email-dns.mjs`: read-only DNS-over-HTTPS check of staff mail
  (Google), platform mail (Resend on send.allamericantattooconvention.com,
  also used by Auth SMTP) and DMARC, plus DNS hints of other senders. Exit 1
  while anything FAILs.

**Run 2026-09-26:** PASS root MX (Google), Resend DKIM, Resend bounce MX and
envelope SPF, DMARC with rua. **FAIL root SPF (none), FAIL Google DKIM (none).**
No DNS traces of GoHighLevel/Mailgun, SendGrid, HubSpot, Mailchimp, Microsoft
or Zoho senders.

**Before p=quarantine:** both FAILs cleared, then a clean window of DMARC
aggregate reports (rua to accounting@) showing no legitimate source failing.
The platform's own mail is From @send.allamericantattooconvention.com and is
DKIM-aligned, so quarantine does not touch it; the risk is staff mail and any
third-party tool sending as the root domain.
