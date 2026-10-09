# 2026-10-09 - application editor PR 2: the form

Plan: docs/superpowers/plans/2026-10-09-application-editor-and-vip.md.
Ryan's go (2026-10-09): build PR 2 as proposed; the vendor ID document is
optional in the editor; Add A Booth retires in a small follow-up PR after
Ryan has tested the editor live.

## Delivered (this branch; not merged, nothing applied)

- `/admin/applications/new` (admin only via src/proxy.ts) and a "New
  application" button on /admin/applications. Form:
  `src/components/admin/ApplicationEditorForm.tsx`, reusable by PR 3.
- Save order: create, upload, save again with the references. After a save
  the form stays on that application (later saves update it), so IDs can be
  marked verified (`set_artist_id_verified`) and failed uploads retried
  without a duplicate. Paths: IDs, vendor ID, veteran ID in private
  `application-docs/admin/<id>/`; logo, photos, portfolios in
  `exhibitor-media/<id>/` (timestamped names: admin cannot overwrite).
- Below-list custom total: the route's 409 `needsConfirm` shows a Confirm.
- `planApplication` also carries the vendor ID (`id_doc_url`), the veteran
  ID (`veteran_id_url`), each written only when sent, and
  `artists_ids_later`.
- /admin/applications honours `?open=<id>` (the internal-notice email has
  linked there all along; the page ignored it).
- `TATTOO_STYLES` has one home, `src/lib/tattoo-styles.ts` (four copies
  removed).
- Teardown for the live test: `supabase/seeds/teardown_zz_editor_test.sql`
  (tested on the local replay: deletes both test rows; aborts when an
  invoice has money on it).

No migration, no verify. `npm test` 350 passed, `npm run build` passed.

## Next

1. Ryan tests live (steps in the PR), runs the teardown.
2. Follow-up PR: remove Add A Booth from /admin/booths (decision d).
3. VIP Meet & Greet featured artists (plan section).
