# 2026-10-08 - Food truck permit and license uploads (PR 3 of 3)

Branch `feat/food-truck-documents`. Plan and Ryan's PR 3 decisions:
[docs/superpowers/plans/2026-10-07-food-truck-application.md](../../superpowers/plans/2026-10-07-food-truck-application.md).

## Delivered, NOT applied: migration 093

**Order: apply 093, run verify_093.sql, run
`node scripts/verify-food-truck-docs.mjs`, THEN merge.** The form, portal
and admin read the new columns and bucket.

- Bucket `food-truck-docs`: PRIVATE, 10 MB, PDF / JPG / PNG.
- Storage policies (the only policies added):
  - owner insert into their own truck's folder;
  - admin insert;
  - admin read.
  - No owner read, no update or delete (a new upload is a new file name).
- `food_trucks`, per document (permit, license): `*_path`, `*_uploaded_at`,
  `*_verified_at`, `*_verified_by`. CHECK: a path sits in the truck's own
  folder.
- `food_trucks_docs_guard`: a new path stamps the upload time and CLEARS
  the verification. The verified columns change only through
  `set_food_truck_doc_verified()` (admin only; refuses a document never
  uploaded) or a server context.

verify_093:
- `npm run verify:local -- supabase/verify/verify_093.sql` PASS (A, B1, B2a,
  B2, B3, B3b, B4); `--audit` PASS (131 fixture inserts).
- Mutation checks, each caught:
  - guard keeps verification on a replacement -> B4;
  - guard always trusted -> B2a;
  - the setting compared without coalesce -> B2a.

**Bug found and fixed before delivery:** the first guard compared
`current_setting('aatc.truck_doc_verify', true) = 'on'` without coalesce.
- Unset, that is NULL, `not NULL` skips the revert, and an owner could mark
  their own document verified.
- The first verify missed it: B3's admin call had already set the setting to
  '' in the same transaction.
- B2a now runs before anything sets it. 088's guard already uses coalesce.

`scripts/verify-food-truck-docs.mjs` (live, Storage API, 090 pattern) was
NOT run: 093 is not applied yet. It checks:
- an owner uploads a PDF into their own folder, and not another truck's;
- the bucket refuses text/plain;
- the owner, anon and the public URL cannot read the file;
- recording the path stamps it and leaves it unverified.

## Code

- **Form:** two optional pickers (Health permit, Business license). Files go
  through signed upload URLs into the private bucket; `/files` records them.
  The internal notice lists them.
- **Portal:** "Health Permit & Business License" card
  (`TruckDocumentsPanel`): state per document and Upload / Replace. A
  replacement goes back for review.
- **Admin:**
  - "Docs" column (permit / license: missing, uploaded, verified);
  - a panel with View (`/api/admin/food-truck-docs`, five-minute signed
    URLs, paths read from the truck row) and Mark verified / Unverify (RPC).
- `application-docs.test.ts` "signing has one home" now allows exactly two
  routes, one per private bucket, both admin-only and both reading paths
  from the row.

Tests: `npm test` 296 PASS. `npm run build` PASS. Screenshot of the form's
new section (forced open locally, not committed) at 390px and 1280px.

## For the next docs PR (not edited here, per the handoff rule)

- open-items.md, "ID document retention": food-truck permits and licenses
  follow the same decision (Ryan, 2026-10-08).
- migrations.md: 093 once applied.

## Not done / known

- The live upload script has not run (093 not applied).
- Portal and admin changes have no screenshots (need signed-in sessions).
