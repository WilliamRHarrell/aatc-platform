# Sponsor Application Flow Design

## Overview

Add a public sponsor application form, admin approval workflow, and sponsor portal - mirroring the exhibitor flow.

## Database Changes

Add columns to `sponsorships` table (migration 013):

| Column | Type | Notes |
|---|---|---|
| `contact_name` | text | Required on application |
| `email` | text | Required - used for approval email + account linking |
| `phone` | text | Optional |
| `instagram` | text | Optional |
| `facebook` | text | Optional |
| `notes` | text | Optional message from applicant |
| `user_id` | uuid references auth.users | Set when sponsor creates account after approval |

Update `database.ts` types to match.

Add `'sponsor'` to the `profiles.role` enum so portal can detect sponsor users.

## Pages

### 1. Public Sponsors Page (`/sponsors`) - UPDATE

Enhanced display of confirmed sponsors grouped by tier: logo, name, website, instagram, facebook. Below, the existing sponsorship packages section with a "Become a Sponsor" CTA button linking to `/apply/sponsor`.

### 2. Sponsor Application Form (`/apply/sponsor`) - NEW

No auth required. Multi-field form collecting:
- Company/sponsor name, contact name, email, phone
- Website, instagram, facebook
- Preferred sponsorship tier (visual tier picker)
- Logo upload (optional)
- Notes/message

Submits to `sponsorships` table with `status: 'pending'`. Shows success confirmation.

### 3. Admin Sponsorships Page (`/admin/sponsorships`) - UPDATE

- Show contact fields (email, phone, social) in the sponsor list rows
- Add "Approve" button for pending sponsors (changes status to `confirmed`, creates invoice, sends approval email via `/api/send-email`)
- Approval email includes link to create an account at `/auth/login`

### 4. Portal Page (`/portal`) - UPDATE

Detect if logged-in user has a sponsorship (via `user_id` on `sponsorships` table). If sponsor:
- Show sponsorship details: tier, perks, amount
- Invoice card with Stripe payment (reuse existing partial payment flow)
- Logo upload/update
- Editable profile fields (website, instagram, facebook)

If exhibitor: show existing exhibitor portal (no changes).

## Auth Flow

1. Sponsor submits application (no account needed)
2. Admin reviews on `/admin/sponsorships`, clicks "Approve"
3. Status changes to `confirmed`, invoice created, approval email sent
4. Email contains link to `/auth/login` where sponsor creates account with their application email
5. On account creation, `profiles.role` is set to `'sponsor'`
6. Portal page detects sponsorship via `sponsorships.user_id = auth.uid()` match
7. The `user_id` on sponsorships is set when user signs up with the matching email (handled in the auth trigger or on first portal load)

## Files to Change

- `supabase/migrations/013_sponsor_application_fields.sql` - new columns + role enum
- `src/types/database.ts` - update sponsorships + profiles types
- `src/app/sponsors/page.tsx` - enhanced sponsor display + CTA
- `src/app/apply/sponsor/page.tsx` - new application form
- `src/app/admin/sponsorships/page.tsx` - approve button, contact display
- `src/app/portal/page.tsx` - sponsor portal section
- `src/app/api/send-email/route.ts` - sponsor approval email template
