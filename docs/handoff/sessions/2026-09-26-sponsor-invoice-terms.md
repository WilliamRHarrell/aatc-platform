# Session 2026-09-26: sponsor invoices on their own terms (migration 081)

**Delivered, NOT APPLIED.** Branch `feat/sponsor-invoice-terms`.

- No 25% first-payment minimum on sponsor invoices: one rule,
  `nextPaymentMinimumCents` (src/lib/invoice-payment.ts), read by
  /api/create-checkout and /portal/pay. Booth invoices unchanged. The pay page
  shows a sponsor its own due date instead of the booth deadline.
- Due dates no longer show a day early: `formatDateOnly` (src/lib/date-only.ts)
  in the portal's three invoice lists (booth, sponsor, food truck), the admin
  and the reminder email.
- /admin/invoices: a due-date field on every unpaid invoice (blank clears it),
  and "No email on file" on sponsor invoices that reminders cannot reach.
- Reminders 30 and 7 days before due_date, sponsor invoices only, from the
  lifecycle sweep, behind `SPONSOR_REMINDERS_ENABLED` (independent of the
  booth sweep's switches). Claimed once per stage (081 columns), released if
  the send fails; missed days catch up; nothing after the due date; nothing
  ever expires a sponsorship. `?dry_run=1` lists what would be sent.
- Live 2026-09-26 (read-only): Nomadica, AATS, WholeLife all have due dates
  and NO email or linked account, so no reminder can reach them yet.

**Order:** merge, apply 081, paste verify_081.sql, add sponsor emails / link
accounts in /admin/sponsorships, check `?dry_run=1`, then set
`SPONSOR_REMINDERS_ENABLED=true` in Vercel.
