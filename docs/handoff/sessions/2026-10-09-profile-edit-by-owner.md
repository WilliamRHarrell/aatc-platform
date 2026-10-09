# 2026-10-09 - profile_edits.by_owner NULL (097); IDs never gate the directory

From Ryan's #102 test: artist steps passed; saving "ZZ Joes Vendor" with a
new vendor ID and a logo failed with `null value in column "by_owner" of
relation "profile_edits"`.

## Cause

048's `log_profile_edit()` (AFTER UPDATE on applications) set
`v_owner := (auth.uid() is not null and auth.uid() = new.user_id)`. On an
application with no account (`user_id` null) that is NULL, so the log insert
failed and rolled back the UPDATE. It fires only when business_name,
website, instagram, facebook, phone or logo_url changes. Service role gave
false (safe); a signed-in admin on an unlinked row gave NULL. Only 048 has
this pattern.

Exposed paths (signed-in admin, logged field, row possibly unlinked): the
editor route's update, and the booth page's profile save and logo
upload/remove. Not exposed: portal, artist form, roster completion (owner,
always linked); drawer controls, comp, approve, send back, directory
override, veteran verification (no logged field); service-role routes.

Not silent: the UPDATE failed and the error was shown (editor message,
guardedWrite toast). Production read 2026-10-09: 2 applications have no
account, both ZZ test rows; profile_edits has 14 rows, none on them.

## Delivered (this branch; not merged, NOT APPLIED)

- **097** `supabase/migrations/097_profile_edit_by_owner.sql`:
  `by_owner = coalesce(auth.uid() = new.user_id, false)`.
- **verify_097**: admin edit of an unlinked row (logo + name) lands and logs
  2 staff rows; owner edit logs by_owner true; service role logs false.
  `npm run verify:local` PASS; `--audit` PASS (140 fixture inserts); against
  the schema before 097 it fails A, and block B alone reproduces the exact
  production error.
- Directory rule (Ryan): ID documents never affect listing, for vendors or
  artists. `planApplication`: a vendor is always roster-complete (reverts
  #102); an artist is complete when every artist is listed (IDs and ID
  later no longer count).
- `supabase/seeds/vendors_needs_roster_2026_10_09.sql` (NOT RUN, Ryan's
  call): clears needs_roster on Rhino's Exotic Wooden Pipes (listed after)
  and Orebro International (listed once its deposit is paid). Side effect:
  their portal stops asking for the booth-holder ID.
- Teardown: the vendor is "ZZ Joes Vendor", not "ZZ Editor Test Vendor";
  `teardown_zz_editor_test.sql` matches it (re-tested on the replay).

Listing changes vs the rule (production, 2026-10-09): only Rhino's (held by
needs_roster, deposit paid). Orebro is held too but has no deposit. No
listed exhibitor loses its listing. The ZZ artist row has no logo stored.

`npm test` 369 passed, `npm run build` passed.

## Order

Apply 097 + verify_097 (any time; no code depends on it) → Ryan re-runs the
vendor step → teardown. Then retire Add A Booth → VIP → Featured.
