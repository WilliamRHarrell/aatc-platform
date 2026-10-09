# 2026-10-09 - application editor PR 3: edit any application

Ryan (2026-10-09): editor PR 2 live test A and B passed; the one gap was that
an editor-made application could not get documents or photos after leaving
the form (the drawer has no upload). PR 3 moved ahead of VIP. "Edit in
editor" on every application in the drawer, and a link on the booth page.

## Delivered (this branch; not merged, nothing applied)

- `/admin/applications/[id]/edit` (admin only): the PR 2 form loaded with
  the saved row and its invoice, any status. Rejected / waitlisted open as
  "Keep as ...". Artist keys the form does not edit ride along (`extra`).
- Price lock: once `amount_paid > 0`, booths, add-ons, artist count, veteran
  and price are disabled (the route refuses them too); contacts, roster,
  documents and photos stay editable.
- Route: an UPDATE whose order is unchanged (`samePricingInputs`: booths,
  corners, add-ons, artist count, veteran, money choice) keeps the stored
  `total_amount`, `agreed_total`, comp and invoice. Production read
  (2026-10-09): 9 of 26 rows carry a total that differs from today's list
  (6 paid), so recompute-and-compare would have refused every save on them
  and re-priced the rest. A drawer discount survives an unchanged save.
- Planner when editing (`EditorExisting`): needs_roster is only ever
  cleared (8 approved rows disagree with the rule); an existing 0-artist
  count may stay; a stored order the form cannot show (an artist row with a
  vendor booth, more corners than booths) is kept verbatim; a missing legal
  name already stored does not block the save; styles are no longer cut to
  12 (3 artists have 13-18).
- `comp_permits` money choice, offered only to a row that already has a
  permits-only comp (otherwise a save would remove it).
- `id_doc_url` is written for vendors only (on artist rows it is the booth
  holder ID from the portal's roster completion).
- A vendor with no vendor ID is now off the directory (needs_roster), as on
  the public form; PR 2 created such vendors as listed.
- Dry run on every production row (read-only, 2026-10-09): 26/26 validate,
  0 order changes, 0 needs_roster changes, artist values unchanged except
  trimmed whitespace on two names.

No migration, no verify. `npm test` 369 passed, `npm run build` passed.

## Next (Ryan's order)

1. Ryan tests on the ZZ entries (steps in the PR), then runs
   `supabase/seeds/teardown_zz_editor_test.sql`.
2. Retire Add A Booth. 3. VIP Meet & Greet. 4. Featured badge and homepage.
