# Wall of Honor Import & Print (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 31 WordPress-era tributes (2026 GF form 81, the 2025 East and West pages) import as approved, unpublished rows with `imported_at` set and every original photo preserved; Ryan picks wall photos per entry in a new admin photo picker; a print export zips the published wall.

**Architecture:** Migration 106 relaxes the submitter/branch rules for imported rows only (empty-string-when-imported CHECKs; branch moves into the publish invariant) and inserts the three inactive historical event rows. A script parses the WordPress SQL dump directly (no CSV exists), uploads deduplicated originals to the private bucket, and emits a seed SQL file Ryan runs in a direct SQL session (the `aatc.woh_import` trusted context). The photo picker edits `photo_paths` through the existing admin RLS (the 104 guard never blocks admin writes to it; the DB CHECKs enforce the 3-photo cap and own-folder rule). Print export zips with jszip (already a dependency).

**Tech Stack:** Next.js App Router, Supabase (Postgres/Storage, service role), Node script, jszip, vitest.

**Spec:** The 2026-10-22 spec's PR 3 section + Ryan's 2026-10-23/24 decisions (recorded in the two merged session notes and restated in Global Constraints). Dry-run facts (counts, duplicates, photo matches) are in the controller's memory note `woh-pr3-wordpress-sources` and re-derived by the script.

## Global Constraints

- Branch `feat/wall-of-honor-import` off `origin/develop` (dc1dd09, includes merged PR 2). Migration number **106** (confirmed free). Delivered, not applied; after 105. Never edit 104/105.
- **The backup is read-only and never copied into the repo** (it contains wp-config.php DB credentials): `~/Downloads/site-archive-aatc-live-1785927938-umElHPVcgPmAQPJooFWf8QV4917pkiXFulVk`. The script takes it as an argument; nothing from it is committed. The dump is `wp-content/mysql.sql`, prefix `wp_`; **map columns from each CREATE TABLE, never by position** (wp_gf_entry's last column is source_id, not status).
- Event rows, Ryan's values verbatim, all `is_active false`, `registration_open_date` null, nothing else filled in: **AATC 2025 East** (Crown Complex, Fayetteville, NC, 2025-04-11 to 2025-04-13); **AATC 2025 West** (Greater Tacoma Convention Center, Tacoma, WA, 2025-09-12 to 2025-09-14); **AATC 2026 East** (Crown Complex, Fayetteville, NC, 2026-04-17 to 2026-04-19).
- Imports land **approved, unpublished, `imported_at` set, `consent_social` false**; `consent_at`/`submitted_at` = the original submission date (GF `date_created`; the 2025 pages' `post_date`); submitter name/relationship/email and branch are `''` when unknown — **never invented**. Honoree names verbatim (rank embedded, typos included); the 2025 headings' life years go into `admin_notes` labeled as life years, never into `service_years`.
- Form-path strictness is untouched: a row with `imported_at` null still requires nonempty submitter name/relationship/email and branch at the database.
- Publish invariant gains `btrim(branch) <> ''`: an imported row cannot be published until Ryan fills the branch.
- Photos: the importer copies EVERY original into the entry's private folder but skips WordPress size variants (`-WxH`, `-scaled`, `-rotated` suffixes **only when the base original exists**) and byte-identical duplicates (sha-256), listing every skip in the import report. `photo_paths` starts as ONLY the old page's first photo (a suggestion). The wall cap stays 3.
- Hard-coded source rulings (comment each in the script): skip GF **#34877** (byte-identical duplicate of #34875); skip row **#34920** but upload its non-duplicate photos into **#34717**'s folder (Mikos), noting it in that entry's admin_notes; import **both** Dominic Perry entries (2025 West + 2026 #34719) and flag the pair in the report. **#34889** has no email: imports with `''`, never gets a publish email (existing gate).
- Picker on a published entry: **unpublish first** (ruled: simpler and safe) — the picker is read-only while `is_published`, with that hint; republish copies the new selection (the existing route already copies `photo_paths` and removes the union on unpublish).
- Seed runs are loud, not idempotent-silent: fixed UUIDs mean a re-run aborts on the primary key. A teardown seed deletes exactly the imported ids. docs/CUTOVER.md's "Wall of Honor media off WordPress" stays UNCHECKED (it gets ticked on a docs PR after Ryan actually runs the import).
- verify_106 + `--audit` must pass locally; no storage-table writes from the verify; function-grants rule by name for anything created. No em dashes in src/. Push + PR only after the final whole-branch review; Ryan merges.

## Review Focus

1. **A non-import form submission with empty submitter fields** must still be refused by the database after 106's CHECK swap. → verify_106 positive control (Task 1).
2. **The variant filter must never discard an honoree's only photo** (e.g. only `foo-scaled.jpg` exists, no `foo.jpg`): skip only when the base file exists. → Task 3 unit-style check inside the script's dry run + the report lists every skip for Ryan's eyeball.
3. **Changing the picker selection on a published entry** must be impossible (read-only + hint), and a republish after unpublish must put exactly the new selection on the wall with the old copies gone. → Task 2 UI state; existing route behavior re-verified in Task 2's review.
4. **Running the seed twice** must fail loudly on the first duplicate id, not silently double the wall. → Task 3 seed structure (fixed UUIDs, plain inserts); teardown provided.
5. **The print zip with names like "Cynneca Ange' Searcy"** (apostrophes, unicode) must produce valid folder names and a CSV that opens clean; a large wall must not crash the route. → Task 4 sanitizer + size note.

---

### Task 1: Migration 106, verify_106

**Files:**
- Create: `supabase/migrations/106_wall_of_honor_import.sql`, `supabase/verify/verify_106.sql`

**Interfaces:**
- Produces: CHECK semantics `imported-rows-may-have-empty submitter_name / submitter_relationship / submitter_email / branch`; publish invariant requiring nonempty branch; three event rows findable by exact name (`AATC 2025 East` / `AATC 2025 West` / `AATC 2026 East`). No column type or nullability changes (empty string, not NULL, so types/views stay put).

- [ ] **Step 1:** `npm run verify:local -- --dump-schema`; record in the header the exact names and definitions of 104's nonempty CHECK constraint(s) and the publish-invariant CHECK (read 104/105 too) — 106 drops and recreates them by name.
- [ ] **Step 2: Write the migration** (one begin/commit): drop/recreate so that table-wide nonempty keeps ONLY `honoree_name` and `tribute`; the four relaxed columns get `(imported_at is not null or btrim(col) <> '')`; the publish CHECK becomes `not is_published or (status = 'approved' and cardinality(public_photo_paths) >= 1 and btrim(branch) <> '')`. Then the three event inserts, guarded `where not exists (select 1 from events where name = ...)`, with Ryan's values verbatim and `is_active false`. Comments say why (WordPress-era rows lack these fields; never invented; Ryan fills branch before publish).
- [ ] **Step 3: verify_106**: A) constraints exist with the new definitions (pg_constraint), three event rows present, inactive, exact dates/venues, and the active event is still the 2027 one; B) on a ZZ fixture event: a row with `imported_at` null and `''` submitter_email → check_violation (Review Focus 1); an imported row (`imported_at` set via trusted context... note `imported_at` is guard-protected for non-admins only, the verify runs as postgres) with all four `''` inserts fine; publishing it (approved + public photo) → check_violation while branch is `''`, succeeds after `branch = 'Army'`; C) existing 105 behavior intact: the published fixture is visible in the view from its inactive event. Fixtures deleted; both verify commands + `npm test` pass.
- [ ] **Step 4: Commit.**

---

### Task 2: Admin photo picker

**Files:**
- Modify: `src/app/admin/wall-of-honor/page.tsx`

**Interfaces:**
- Consumes: `photoQuality`, `WOH_PHOTO_MAX_COUNT`, `WOH_SUBMISSIONS_BUCKET` (lib); admin storage read policy (signed URLs + `list`); DB CHECKs (cap 3, own folder) as the backstop.
- Produces: `EntryPatch` gains `photo_paths: string[]` (the ONLY addition; publish state stays route-only).

- [ ] **Step 1: Build the drawer section "Wall photos".** `storage.from(WOH_SUBMISSIONS_BUCKET).list(entry.id)` (files with an id, name starting `photo-`), signed URLs, each thumbnail showing naturalWidth x naturalHeight + `photoQuality(min side)`; tick up to `WOH_PHOTO_MAX_COUNT` (further boxes disable at 3); selection order = wall order with the first labeled "Main" and a "Make main" action on any selected photo; Save writes `photo_paths` via the existing `saveEntry` path and replaces the row from the DB response. While `is_published`: the section is read-only with "Unpublish first to change the wall photos." Current `photo_paths` pre-ticked in order. Folder files NOT in `photo_paths` render as unselected (that is where imported extras live).
- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test`; `npm run build`. **Step 3: Commit.**

---

### Task 3: Import script, seed and teardown

**Files:**
- Create: `scripts/import-woh-wordpress.mjs` (replaces the never-run CSV-based plan of `scripts/import-wall-of-honor.mjs`, which stays untouched)
- Generated at run time, committed as empty-by-design: nothing — the seed is NOT committed (it embeds family tributes; Ryan generates it locally). `supabase/seeds/` gains a committed `woh_wordpress_import_README.md` saying how to generate and run it, plus the committed teardown TEMPLATE the script fills: no — simpler: the script writes BOTH `supabase/seeds/woh_wordpress_import.sql` and `..._teardown.sql` into Ryan's working tree at run time, and `.gitignore` gains those two paths so tribute text never lands in git. The README (committed) documents the flow.

**Interfaces:**
- Consumes: migration 106's event names; `entryPhotoPath`-style paths (`<uuid>/photo-<i>-<rand>.<ext>`), `WOH_SUBMISSIONS_BUCKET`; env from `.env.local` (service role) per `scripts/verify-graphics-owner.mjs`'s loader idiom.
- Produces: `node scripts/import-woh-wordpress.mjs --backup <root> [--dry-run | --apply] [--out <report dir>]` — dry run (default) parses + reports only; `--apply` additionally uploads photos and writes the two seed files. Report: per-honoree kept/skipped photos with reasons, counts, the Perry flag, anything unparsed.

- [ ] **Step 1: Write the script.** Streaming SQL-dump parser (CREATE TABLE column maps; single-quoted value tokenizer with backslash escapes); GF form 81 from `wp_gf_entry`+`wp_gf_entry_meta` (meta 1/14/15/12; field 12 is a URL or JSON array); pages 48157/48512 from `wp_posts.post_content` WPBakery blocks (`vc_custom_heading` text = "RANK Name (birth-death)" → name verbatim minus the parenthesized life years, which go to admin_notes; `vc_column_text` = tribute verbatim; `vc_single_image image=` / `vc_gallery images=` → ids via `wp_postmeta._wp_attached_file` → `wp-content/uploads/<path>`). Photo pipeline per honoree: resolve files, sha-256 dedupe, variant skip (regex `-(\d+x\d+|scaled|rotated(-\d+)?)\.(ext)$` and ONLY when the base file exists), stable order (old page order, main first). Hard-coded rulings from Global Constraints with comments. `--apply`: fixed random UUIDs (generated once per run), upload kept originals, write the seed (one transaction: `select set_config('aatc.woh_import','on', false);` then the 31 inserts with id, event lookup by exact name — abort loudly if an event name is missing — approved/unpublished/imported_at now()/original consent_at+submitted_at/photo_paths=[first photo]/`''` unknowns/admin_notes composed) and the teardown (delete storage objects list as a comment + `delete from wall_of_honor_entries where id in (...)`).
- [ ] **Step 2: Dry-run against the real backup** and paste the summary (counts: 13 + 12 + 6 rows; skipped-variant and duplicate lists; the Perry flag; the Mikos photo attachment) into your report. Expected: every kept photo exists on disk; 8 honorees hold more files than the 3-photo wall cap (that is fine — the picker selects).
- [ ] **Step 3:** Add the two seed paths to `.gitignore`; write `supabase/seeds/woh_wordpress_import_README.md` (generate → review report → run seed in a direct SQL session → review in /admin/wall-of-honor; teardown usage; the CUTOVER box gets ticked on a docs PR after the import runs). `npm test` + `npm run build` still pass. **Step 4: Commit.**

---

### Task 4: Print export

**Files:**
- Create: `src/app/api/admin/wall-of-honor/print/route.ts`
- Modify: `src/app/admin/wall-of-honor/page.tsx` (one "Download print export" button near the switch)

**Interfaces:**
- Consumes: admin auth pattern (`src/app/api/admin/wall-of-honor/publish/route.ts`), jszip (in deps), private-bucket originals of each published entry's `photo_paths`.

- [ ] **Step 1: Build GET `/api/admin/wall-of-honor/print`**: admin check; rows = `is_published and include_in_print`, ordered year then name; zip with one folder per honoree — `sanitize(`${honoree_name} (${event year})`)` (strip `/\:*?"<>|`, collapse whitespace; dedupe with a numeric suffix) — containing the original photos (downloaded from the PRIVATE bucket, full quality, numbered in `photo_paths` order) and `tribute.txt` (name, rank, branch, unit, service years, year, the display tribute); plus `wall-of-honor.csv` at the root (same fields + photo count + include flag, proper quoting). Response: the zip buffer with `content-disposition: attachment`. Empty wall → 200 zip with just the (empty) CSV. Top comment notes the in-memory buffer and the realistic scale (tens of entries); final layout still waits on the printer's specs (decision 10) — this is the originals+text export the spec defaulted to.
- [ ] **Step 2: Wire the button** (plain link/anchor to the route). **Step 3: Verify** — tsc, `npm test`, `npm run build`. **Step 4: Commit.**

---

### Task 5: Session note and full verification

**Files:**
- Create: `docs/handoff/sessions/2026-10-24-wall-of-honor-import.md` (the branch's ONLY handoff edit)

- [ ] **Step 1: Session note**: what PR 3 adds; 106 delivered NOT applied, after 105; Ryan's run order (merge → apply 106 → `node scripts/import-woh-wordpress.mjs --backup ... --apply` from HIS checkout, with .env.local present → run the generated seed in a direct SQL session → review in /admin/wall-of-honor: fill branch, pick photos, publish) ; the import rulings (34877 skipped, 34920 folded into 34717, Perry both + flagged, 34889 no email, consent_social false, life years in admin_notes); seeds are git-ignored because they embed family tributes; the CUTOVER box ticks on a later docs PR; the picker's unpublish-first rule; the four verification outcomes verbatim.
- [ ] **Step 2: Full verification**: `npm test`, `npm run build`, `npm run verify:local -- supabase/verify/verify_106.sql`, `npm run verify:local -- --audit` — all PASS, outcomes recorded. **Step 3: Commit.** (Push + PR after the final whole-branch review.)
