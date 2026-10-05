# Session 2026-10-05: food-truck portal access (branch feat/food-truck-invite)

The three imported trucks (Jaz n Soul, Simply Coffee, California Taco) need
portal access through Invite & link.

## Found (2026-10-05)
- Invite & link handled sponsorships and applications only.
- The portal already shows a linked truck and its invoice, but
  `invoices: own read` uses owns_invoice(application_id, sponsorship_id),
  so a truck owner could not see or pay their own invoice.
- "Vendors update own food_truck" lets an owner change every column: days
  (the price), is_published (self-publishing), email, event.
- Storage: "Vendors insert / update own food truck logos" only check
  auth.uid() IS NOT NULL, so any signed-in account could overwrite any
  truck's public logo.

## Delivered, not applied: migration 090 + verify_090 + scripts/verify-food-truck-owner.mjs
**Apply 090, run verify_090.sql, then `node scripts/verify-food-truck-owner.mjs`,
before inviting the trucks.**

- **New policy `invoices: own food truck read`:** the owner sees their own
  truck's invoice.
- **New trigger `food_trucks_protect_staff_columns_trg`:** for non-staff,
  event_id, user_id, email, days, thursday_setup and is_published are
  restored. admin and content_editor are exempt.
- **Storage:** the two vendor logo policies are replaced by ones scoped to
  `<own truck id>/...`, the path the portal uses.
- Existing policies were enumerated first (listed in the migration header);
  only those two storage policies change.

**verify:local:**
- verify_090 A, B1 and B2 pass, and 086-089 + the matrix still pass on top.
  `--audit` reports 0 missing.
- **Negative controls:** without the invoice policy, or without the trigger,
  verify_090 fails.
- Uploads are not testable locally (rules.md: never write storage tables
  from a verify). `scripts/verify-food-truck-owner.mjs` exercises them live
  through the Storage API with a temporary user and ZZ trucks, and removes
  everything.

## App
- `LinkKind` gains `food_truck` (admin only). The route reads and links
  `food_trucks`, with unlink allowed as for sponsorships, and emails "Your
  AATC 2027 food truck is in your portal" / the account invite.
- **Admin food-trucks edit modal:** a "Portal access" section with the
  Invite & link control.

Checks: build passes; `npm test` passes.
