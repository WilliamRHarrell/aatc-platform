# Session 2026-09-26: sponsor terms, Skin Reserve protection

## Delivered, NOT RUN (Ryan runs SQL)

- `supabase/seeds/sponsor_terms_2026_09_26.sql` - Square payment dates and due
  dates on the three sponsor invoices: WholeLife $750 on 2026-04-23, due
  2027-01-31; Nomadica $1,875 on 2026-05-05, due 2027-01-01; AATS $2,500 on
  2026-05-05, due 2027-01-01. `deposit_paid_at` carries the Square date for all
  three, WholeLife included (sponsors have no deposit requirement; a NULL
  there is what makes the portal demand 25%).
- `supabase/seeds/skin_reserve_in_kind.sql` - the existing Skin Reserve
  sponsorship (3c393126, confirmed, gold, $5,000) becomes `is_in_kind`. Its
  booth, application 13c265d7, is comped in exchange for product. No invoice.

## Teardowns that could destroy Skin Reserve - disabled

Found 2026-09-26 while checking what could touch application 13c265d7
(owner `ryan@skinreserve.com`, profile b98ac442, role public):

- `teardown_test_applications.sql` ran `delete from applications;` with NO
  filter; its only guard is that the RLS-harness records exist, and they do.
  Run today it would delete every real application and its invoices.
  **Retired**: the first statement after `begin;` raises.
- `teardown_import_returning.sql` had `ryan@skinreserve.com` as its target
  address; with `v_dry_run := false` it deletes that account's applications,
  invoices, exhibitor rows and auth user. **Now**: the placeholder address
  again, and a new Guard 3 refuses any account with a comped application, one
  with money recorded, or 13c265d7 itself.

Proposed, not built: a database-level guard (a `protected` flag on
applications and a BEFORE DELETE trigger that refuses protected rows; the
trigger also fires on the cascade from deleting the auth user, so the account
is covered). Scripts can be rewritten; a trigger cannot be forgotten.

## What assumes the booth flow for sponsor invoices (checked, not changed)

| Place | Assumption | Effect on a sponsor |
|---|---|---|
| `src/app/api/create-checkout/route.ts` | first payment must be >= 25% of the total when `deposit_paid_at` is NULL | a sponsor with no recorded payment is refused anything under 25%. Server-side, so it is the one that matters. |
| `src/app/portal/pay/page.tsx` | same 25% minimum, client side | same, as the form's validation |
| `src/app/portal/page.tsx` (three places) | `new Date(due_date).toLocaleDateString()` on a date-only string | parses as UTC midnight: 2027-01-01 shows as 12/31/2026 in US time zones. Affects every invoice with a due date; only sponsors have them. |
| `/admin/invoices` Record payment, Stripe webhook | set `deposit_paid_at` when 25% is reached | harmless for sponsors once the minimum above is skipped; the column means "first payment" for them |
| `/admin/sponsorships` approve / "Send invoice" | creates the invoice with no `due_date`, and there is no due-date field anywhere in the admin | negotiated terms can only be entered by SQL |
| `src/app/api/cron/lifecycle-sweep/route.ts` | queries `applications` only | never expires, cancels or reminds a sponsor. Correct on expiry; but there are NO sponsor reminders at all, on any date |
| `src/app/api/send-email/route.ts` deposit/final/expiration/cancellation | booth wording, `FINAL_DUE_LABEL` (January 1), "booth will be canceled" | only ever sent for applications, so sponsors never see them |
| sponsorships `hold_expires_at` | display-only in /admin/sponsorships | nothing expires a sponsorship automatically |
