# 2026-10-09 - Sponsor applicant notes apart from internal notes (item D of the form audit)

Branch `feat/sponsor-applicant-notes`. The public sponsor form's notes landed
in `sponsorships.notes`, which /admin/sponsorships edits as "Internal notes",
so applicant text and staff notes mixed and an admin edit overwrote the
sponsor's words.

## Delivered, NOT applied: migration 095

**Order: apply 095, run verify_095.sql, THEN merge.** /api/sponsor-apply
writes `applicant_notes`.

- `sponsorships.applicant_notes` (nullable text). Written by the form, shown
  read-only in admin as "From the application"; `notes` is labelled
  "Internal notes".
- **No data moved.** Ryan's rule: rows from the public form move their notes,
  rows created in admin keep theirs. Production read 2026-10-09:
  - 12 sponsorships, all created on or before 2026-09-01;
  - none since /api/sponsor-apply became the form's only writer (2026-09-25);
  - the 4 with notes (Tattoo Goo, Nomadica, two ZZ RLS-harness fixtures) are
    staff-written.
  - So every existing note stays internal, and the move group is empty.
- A linked sponsor cannot rewrite it: 049's allow-list clamp protects new
  columns by default. No policy changes; not in `sponsors_public`.

verify_095:
- `verify:local` PASS (A, B); `--audit` PASS.
- B proves the owner update ran (phone changed) and only `applicant_notes`
  was held.

`npm test` 309 PASS.
