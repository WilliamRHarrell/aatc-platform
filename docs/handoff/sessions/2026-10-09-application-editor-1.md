# 2026-10-09 - Application editor, PR 1 (server side + migration 096)

Branch `feat/admin-application-editor-server`. Ryan's feature: build a whole
application on someone's behalf (recruits, Ink Master artists). Decisions
2026-10-09:
- status pending (default) or approved;
- custom total below list needs the large-discount confirmation (above list
  does not);
- optional per-artist bio, photo (admin upload, falls back to the first
  portfolio image) and TV credit;
- Add A Booth retires once the editor is live.

## Delivered, NOT applied: migration 096

**Order: apply 096, run verify_096.sql, THEN merge.**

- `applications.agreed_total` (cents, nullable, >= 0): Ryan's Option 1, a
  home for a custom total while the application is pending. Approve invoices
  it; total_amount stays the list price.
- Admin only, via its own trigger (`applications_protect_agreed_total`): a
  non-admin insert clears it, a non-admin update restores it. No policy
  changes; not in applications_public.
- verify_096: `verify:local` PASS (A, B1-B4); `--audit` PASS. Mutation (guard
  does nothing) fails B3.

## Code

- `src/lib/admin-application.ts` `planApplication()`:
  - validation; list price from calculatePricing;
  - booths of the exhibitor's own type; the 2/4 cap; roster no longer than
    artist_count;
  - needs_roster until every artist has an ID or "ID later";
  - money choices: standard / custom / comp booth / comp booth + permits;
  - per-artist bio, photo_url, tv_credit kept in the roster.
- `POST /api/admin/applications/editor` (admin only, cookie client so every
  trigger sees an admin):
  - one active application per email per event (null-user rows are outside
    079's index);
  - create (user_id null) or update; a paid invoice freezes the price;
  - set_comp for comps;
  - approved writes what Approve writes and creates or re-prices the invoice;
    pending sends back;
  - no email (Invite & link).
- Drawer Approve: an agreed total replaces the list price and hides the
  discount box ("Invoice on approval ... (agreed total; list $Y)"); a
  re-approval re-prices an unpaid invoice to it.

Tests: `npm test` 342 PASS (planApplication cases, guard tests).

**Not run end to end:** the route needs a signed-in admin, and no admin
account was created in production for testing. PR 2 (the form) is where Ryan
drives it with his account.

## Next

- PR 2: the editor form (contact, booths, add-ons, roster with uploads, logo,
  TV, money, status).
- Then VIP Meet & Greet (per-artist id), editor PR 3 (edit any application),
  directory badge and homepage.
