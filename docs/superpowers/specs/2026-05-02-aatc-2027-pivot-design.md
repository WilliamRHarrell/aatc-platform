# AATC 2027 Pivot — Design Spec

**Date:** 2026-05-02
**Author:** Ryan Harrell + Claude
**Show:** AATC East 2027, April 16–28, 2027
**Status:** Draft pending user approval

## Context

The 2026 platform shipped (mostly — final Vercel cutover stalled). The decision was made not to rush the 2026 launch; instead, the platform pivots to AATC 2027. Pre-registrations will be inserted into the platform before the public launch. This spec defines the data, lifecycle, and code changes required.

Schema is already multi-year via `event_id` foreign keys on `applications`, `booths`, `exhibitors`, `contests`, `sponsorships`, `panels`, and `food_trucks`. The pivot is data + business-logic, not schema redesign.

## Show + Launch Timeline

- **Now (2026-05-02) → ~2026-06-01**: 30-day **offline** window. Returning 2026 exhibitors who pay in full lock 2026 pricing. Records collected outside the platform.
- **~2026-06-02**: Site launches publicly. Returning-customer records pre-loaded as paid-in-full. Pre-registration form goes live at 2027 pricing with 25%-minimum deposit model.
- **2027-01-01**: Final payment deadline for all booths.
- **2027-04-16 to 2027-04-28**: AATC East 2027 show.

## Section 1 — Year/Event Pivot

1. Insert a new `events` row for AATC 2027:
   - `name`: AATC East 2027 (or current naming convention)
   - `start_date`: 2027-04-16, `end_date`: 2027-04-28
   - `is_active`: `true`
2. Set the existing 2026 event row to `is_active: false`.
3. New booth-seed migration mirrors `005_seed_booths.sql` against the new `event_id`. Booth count and corner list unchanged: 267 booths, 72 corners.
4. Refactor public-facing pages to read `events where is_active = true limit 1` rather than hardcoding event details. Confirmed surface for the rename:
   - `src/app/apply/page.tsx:7` — `REGISTRATION_OPENS` constant
   - `src/app/apply/page.tsx:121` — display string "April 19, 2026"
   - `src/components/PublicNav.tsx:189` — wordmark `#AATC26` → `#AATC27`
   - Implementation phase will grep the full codebase for `2026`, `Apr 19`, `April 19`, `AATC26` to catch the rest.
5. 2026 data stays in the DB (read-only by virtue of `is_active=false`). Useful for matching returning customers and for historical reporting.

## Section 2 — Pre-Registration Form (existing 4-step wizard, updated)

**Decision:** Keep the existing 4-step wizard at `/apply/artist` and `/apply/vendor`. Do NOT replace with the AATC East single-page reference form. The reference was used only to extract the new pricing and add-on list.

### Pricing changes (2027)

| Item | 2026 | 2027 |
|---|---|---|
| Artist Single | $700 | **$800** |
| Artist Double | $1,100 | **$1,200** |
| Artist Triple | $1,800 | (retired as discrete option — purchased as Single + Double) |
| Artist Quad | $2,200 | (retired — purchased as Double + Double) |
| Vendor Single | $400 | **$500** |
| Vendor Double | $700 | **$800** |
| Vendor Triple | $1,100 | (retired) |
| Vendor Quad | $1,400 | (retired) |
| Add Corner | +$50 | **+$100** |
| Artist Permit Fee | $50/artist | $50/artist (unchanged) |
| Veteran Discount | -$150 | -$150 (unchanged) |

**Triple/quad behavior:** the form lets applicants buy multiples of single and double. A "triple" is a Single + Double; a "quad" is Double + Double. UI surfaces this as "buy more booths" rather than naming the combinations.

### New add-ons (2027)

Each add-on is **one term + a quantity** (not a mix of terms per equipment):

| Add-on | Terms / Pricing |
|---|---|
| Extra Table | $50 (per unit) |
| 2 Extra Chairs | $50 (per set) |
| Tattoo Bed | Daily $50 / Weekend $150 |
| Arm Rest | Daily $40 / Weekly $80 |
| Tattoo Light | Daily $40 / Weekend $80 |

Form pattern: applicant picks one term per equipment type, then enters a quantity. Example: 2× Tattoo Bed Weekend = $300.

### Other form behavior

- Booth holder ID upload remains **required at intake** (existing behavior).
- Veteran ID upload remains conditional on Veteran=Yes.
- Per-artist data (names, IDs) collected at intake in step 3 (existing behavior — confirmed user wants to keep this).
- Booth-size field changes from one-of-{single, double, triple, quad} to a quantity table (Artist Single qty, Artist Double qty, etc.). Form recomputes total live.
- DB schema for `applications.booth_*` columns may need to be normalized to support multiple booths per application — see Open Question DB-1.

## Section 3 — Booth Lifecycle and Payment Flow

### State machine

```
[pending] ──admin approves──→ [approved]
                                  │
                       (30-day deposit clock starts)
                                  │
                ┌──no deposit────→ [expired] (auto, slot reopened)
                │ in 30 days
                │
                └──≥25% paid─────→ [deposit_paid]
                       (any amt   │
                        ≥ 25%)    │ visible on /directory + admin siteplan
                                  │ admin can assign booth #
                                  │
                              ┌──remainder unpaid──→ [canceled] (Jan 1 + 1 day)
                              │  by 2027-01-01        deposit forfeited, slot reopened
                              │
                              └──amount_paid==total─→ [paid_in_full]
```

### Data model changes

- Extend `application_status` enum to add `expired` and `canceled`. Keep existing `pending` / `approved` / `rejected` / `waitlisted`.
- Add columns to `applications`:
  - `approved_at timestamptz null`
  - `deposit_due_at timestamptz null` (computed = approved_at + interval '30 days')
  - `final_due_at timestamptz null` (= 2027-01-01 00:00 for all 2027 applications)
  - `needs_roster boolean not null default false` (true for pre-loaded returning customers; see Section 4)
- Add columns to `invoices`:
  - `deposit_paid_at timestamptz null` — set the moment `amount_paid >= 0.25 * total`
  - `final_paid_at timestamptz null` — set the moment `amount_paid >= total`
- Use the existing partial-payment fields from migration 010. No separate "deposit invoice" — one invoice per application, milestones tracked via the two timestamps.

### Payment flow (applicant POV)

1. Apply via 4-step wizard. Application status = `pending`.
2. Admin approves in `/admin/applications`. Background:
   - `applications.status` → `approved`, `approved_at` set
   - `invoices` row auto-generated: total = full booth + add-ons + permits − discounts
   - Approval email sent with link to `/portal`
3. Applicant lands on `/portal` and sees a "Make a payment" button → goes to a payment page.
4. **Payment page (new)** at `/portal/pay`:
   - Shows: total invoice, amount paid, balance due
   - Lets applicant enter any amount **≥ minimum**
   - On the first payment, minimum = `Math.ceil(total_cents * 0.25)` (Stripe operates in integer cents; round up to avoid pennies-short cases)
   - On subsequent payments, minimum = $1 (or some sensible floor); maximum = remaining balance
   - "Pay" button → Stripe Checkout for the entered amount
5. Stripe webhook on `checkout.session.completed`:
   - Increment `invoices.amount_paid` by the session amount
   - If `amount_paid >= 0.25 * total` and `deposit_paid_at IS NULL` → set `deposit_paid_at = now()`, create `exhibitor` row (visibility opens), email applicant ("deposit received")
   - If `amount_paid >= total` and `final_paid_at IS NULL` → set `final_paid_at = now()`, email applicant ("paid in full")
6. Applicant can return to `/portal/pay` any time after the deposit and pay any amount. Repeat.

### Visibility rule

Public `/directory`, `/directory/[id]`, and admin booth siteplan show only records where:

```
applications.status = 'approved'
AND invoices.deposit_paid_at IS NOT NULL
AND applications.needs_roster = false   -- pre-loaded returners must complete roster first
```

Update migration 007's RLS policy to enforce the deposit + roster condition for the public read.

### Booth assignment (admin)

Admin assigns booth numbers manually in `/admin/booths`. The application list within that page is filtered to deposit-paid records sorted by `deposit_paid_at ASC` — that enforces first-come-first-serve by deposit time.

### Timeout enforcement

Use **Supabase `pg_cron`** running nightly (T1).

- **Deposit timeout job** (nightly): finds applications where `status='approved'`, `deposit_due_at < now()`, and `invoices.deposit_paid_at IS NULL`. For each: status → `expired`, slot reopens (booth assignment cleared if any). Email sent.
- **Final timeout job** (runs on 2027-01-02): finds applications where `status='approved'`, `final_due_at < now()`, and `invoices.final_paid_at IS NULL`. For each: status → `canceled`, deposit forfeited (no auto-refund), exhibitor row deleted (siteplan slot reopens), booth assignment cleared. Email sent.

### Reminder emails

| Trigger | Recipient |
|---|---|
| Approval | "Approved — pay 25% to secure" |
| 7 days before deposit deadline (no deposit yet) | Deposit reminder |
| 30 days before Jan 1 (no final yet) | Final reminder |
| 14 days before Jan 1 (no final yet) | Final reminder |
| 7 days before Jan 1 (no final yet) | Final reminder |
| 1 day before Jan 1 (no final yet) | Final reminder (urgent) |
| Expiration / Cancellation | Confirmation of slot release |

Reminders are sent via the same `pg_cron` jobs that enforce timeouts.

### Refund / cancellation policy

- **Expired** (no deposit in 30 days): no money exchanged, status flip only.
- **Canceled** (no remainder by Jan 1): deposit forfeited per user policy. Stripe charge stays. Status flip + slot reopened. No automated refund.
- **Manual admin cancellation:** admin can cancel any time via `/admin/applications` detail view. If after deposit, deposit is forfeited by default. Refunds are handled manually via the Stripe dashboard at admin discretion — the platform does not automate refunds.

## Section 4 — Pre-Loading Returning Customers

These are 2026 returning customers who pay in full at 2026 pricing during the offline 30-day window. They are pre-loaded into the platform at launch as paid-in-full records.

### Method: Admin form (one-at-a-time)

A new admin page at `/admin/import-returning` provides a single-row form. Volume is expected to be ~10–50 records — a one-by-one form is faster than building a CSV pipeline and avoids spreadsheet-encoding bugs.

### Form fields (minimum information only)

- Email *
- Full name *
- Phone *
- Booth type (Artist | Vendor) *
- Booth size (Single | Double) *
- Booth quantity *
- Corner? (per-booth)
- Total paid amount in cents *
- Notes (free text)

### On submit (per record)

1. Create Supabase auth user (passwordless — magic-link signup invite goes out).
2. Insert `profile` (role=`public`, email auto-confirmed).
3. Insert `application` (status=`approved`, `approved_at`=now(), `needs_roster=true`, no booth-holder ID file).
4. Insert `invoice` (total = paid amount, `amount_paid` = same, `deposit_paid_at` and `final_paid_at` both = now()).
5. Do NOT create `exhibitor` row yet (held until roster is filled in — keeps directory clean).
6. Send launch email: "Your AATC 2027 booth is reserved. Log in to complete your artist roster."

### Portal handling for `needs_roster=true`

`/portal` detects `needs_roster=true` and shows a "Complete your roster" prompt instead of the normal status card. Form fields = same as wizard step 3 (per-artist names + ID uploads + booth-holder ID, since that wasn't collected). On submit:

- `needs_roster = false`
- Create `exhibitor` row → public visibility opens
- Confirmation email

## Section 5 — Other Flows (Light Pivot Only)

| Flow | Change |
|---|---|
| Sponsorships | event_id pivot. **Pay in full** default. Partial payments allowed via same invoice mechanism. **Public visibility (sponsors page + footer logos) gated on `final_paid_at IS NOT NULL`** — different from booths (which open at deposit). No deposit/Jan 1 split logic. |
| Panels | event_id pivot. Admin re-enters 2027 lineup as content firms up. |
| Food Trucks | event_id pivot. Admin enters 2027 lineup. |
| Contests | event_id pivot. Admin enters 2027 contest list. `contest_entries` continue to work. |
| Sponsor footer logos | `featured_footer` flag continues to work per-row. New 2027 sponsors get the toggle in admin. |

## Section 6 — Vercel Deployment + Launch Checklist

Implementation phase opens with this audit:

1. Verify Vercel project linkage and current deploy state.
2. Diagnose where the previous deploy stalled.
3. Wire production:
   - Stripe webhook → production URL, update `STRIPE_WEBHOOK_SECRET`
   - Resend from-domain verified (replace `onboarding@resend.dev`)
   - `NEXT_PUBLIC_SITE_URL` → production URL
   - All env vars from `.env.local` synced to Vercel
4. Run all 2027 migrations against production Supabase.
5. Smoke test: signup → apply (artist + vendor) → admin approve → deposit Stripe checkout → webhook → portal partial-payment → final-paid.
6. Content edit checklist (user-driven): all 2026 references in copy across the site.
7. Run admin import to seed returning customers.
8. Cut over `is_active` → 2027 event.
9. Announce / launch.

## New Migrations Required

- **020 — events_2027_seed**: insert 2027 event row, deactivate 2026.
- **021 — booths_2027_seed**: 267 booths against 2027 event_id, same corner list.
- **022 — application_status_lifecycle**: extend enum (`expired`, `canceled`); add columns `approved_at`, `deposit_due_at`, `final_due_at`, `needs_roster`.
- **023 — invoice_milestones**: add `deposit_paid_at`, `final_paid_at` columns.
- **024 — multi_booth_applications**: normalize booth-size selection to a per-application booth-line model OR extend `applications` columns to per-size quantities (DB-1 below).
- **025 — directory_visibility_rls**: update migration 007's RLS policy to gate public reads on deposit + needs_roster.
- **026 — pg_cron_lifecycle_jobs**: nightly deposit/final sweeps + reminder emails.

## Code Changes (Summary)

- `/apply/artist` and `/apply/vendor` wizards: new pricing, new add-ons, multi-booth quantity selector, live total recompute.
- `/portal`: payment-page link; `needs_roster` branch.
- `/portal/pay` (new): payment-amount entry, minimum-deposit gate, Stripe Checkout for the entered amount.
- `/api/create-checkout`: accept an arbitrary amount (≥ minimum) instead of fixed full-invoice.
- `/api/webhooks/stripe`: increment `amount_paid`, set milestone timestamps, create exhibitor on deposit, send emails.
- `/admin/applications`: handle `expired` and `canceled` statuses; show timeout countdowns.
- `/admin/booths`: filter assignment list to deposit-paid sorted by `deposit_paid_at`.
- `/admin/import-returning` (new): one-row admin form for pre-loading returners.
- `/admin/sponsorships`: gate `featured_footer` and public visibility on `final_paid_at`.
- Site-wide string updates: `#AATC26` → `#AATC27`, dates, copy.
- Email templates: deposit-paid, deposit-reminder, final-payment-reminder (× 4 cadences), expiration, cancellation, roster-completion-needed (returners), roster-completed.

## Open Questions

- **DB-1 — multi-booth modeling.** Today, `applications` has a single `booth_size` column. The 2027 form lets applicants buy any combination of Artist Single, Artist Double, Vendor Single, Vendor Double — so the data shape needs to change. **Two options:**
  - **(a)** Add per-size quantity columns: `artist_single_qty`, `artist_double_qty`, `vendor_single_qty`, `vendor_double_qty`. Simple, fits existing one-row-per-application pattern. Add-on columns extend the same way.
  - **(b)** Normalize: a new `application_lines` table with `application_id`, `kind`, `qty`, `unit_price`. More flexible, scales to future add-on changes, but requires more refactor in the form, admin views, invoice generation, and booth-assignment screens.
  - **Recommendation:** (a) for speed; (b) if you anticipate add-ons changing significantly year-over-year. Decide before implementation begins.
- **DB-2 — Triple/quad vs. multi-booth.** Existing 2026 records use `booth_size = 'triple'` or `'quad'`. Migration to multi-booth model needs a backfill rule (probably: triple → 1 single + 1 double; quad → 2 doubles). Not a blocker for 2027 since 2026 is read-only, but document the conversion if any reports cross years.
- **OPS-1 — pg_cron availability.** Confirm Supabase project tier supports `pg_cron`. If not, fall back to T2 (Vercel Cron) without redesigning state.
- **OPS-2 — Final-deadline timezone.** "By Jan 1" → midnight in which TZ? Eastern (show timezone) is the safe default. Confirm before implementation.

## Out of Scope

- Self-serve booth picking from a live siteplan (admin still assigns).
- Automated Stripe refunds (manual via dashboard).
- Year-over-year reporting / cross-event analytics.
- Sponsor deposit split.
- Mobile-app wrappers.

## Success Criteria

1. New `events` row exists for 2027 and is the source of truth for the public site.
2. A new artist application can be submitted, approved by admin, and paid via the new minimum-25%-deposit flow on Stripe live keys.
3. A pre-loaded returning customer can log in via magic link, complete their roster, and appear on `/directory`.
4. Deposit timeout fires correctly in a manual test (force a record's `deposit_due_at` into the past, run the cron job, observe `expired` status).
5. Final-payment timeout fires correctly (same test on `final_due_at`).
6. The site is reachable on a public URL (production Vercel domain).
