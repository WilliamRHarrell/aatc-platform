# Wall of Honor Submissions (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gold Star families submit a service member online (photos + tribute) at `/info/wall-of-honor/submit`; nothing appears anywhere until Ryan approves it; Ryan reviews at `/admin/wall-of-honor`.

**Architecture:** An exact copy of the public food-truck application shape (091/093): bot trap → unit-tested validation lib → service-role insert of a pending unpublished row → signed upload URLs into a private bucket → `/files` records what arrived. The table has RLS with one admin policy and no anon grant; the public ever only reads a security-barrier view (PR 2). The open/closed switch is `events.wall_of_honor_open`, gated at the route.

**Tech Stack:** Next.js App Router, Supabase (Postgres/RLS/Storage), Resend via `sendTransactional`, vitest.

**Spec:** Ryan's 2026-10-22 Wall of Honor spec (pasted; summarized in this PR's session note `docs/handoff/sessions/2026-10-22-wall-of-honor-submissions.md`). Built decisions are the spec's bracketed defaults 1-12.

## Global Constraints

- Work happens in `../aatc-platform-claude`, branch `feat/wall-of-honor-submissions`, based on `origin/develop` (c820615). No stacked PRs.
- Migration number is **104** (confirmed: 103 is the highest on any branch, merged to develop). Delivered, not applied: Ryan runs the SQL.
- `npm run verify:local -- supabase/verify/verify_104.sql` and `npm run verify:local -- --audit` must both pass before delivery, and the PR says so.
- Never write storage tables from the verify; assert policies from `pg_policies`.
- Enumerate existing policies (`npm run verify:local -- --dump-schema`) before the migration and record them in its header. Expected: nothing touches the new table or buckets; `events` keeps "events: admin write" ALL `is_admin()`, "events: public read" SELECT true.
- No placeholder people, brands, figures, times or assets. No em dashes in `src/` (prebuild guard).
- Contact addresses only from `src/lib/event-config.ts`. Decision 7 RESOLVED (Ryan, 2026-10-22, mailbox confirmed working): add `WALL_OF_HONOR_EMAIL = 'wallofhonor@allamericantattooconvention.com'` next to `CONTACT_EMAIL`; the internal notice goes there, and the two literal mailto addresses in `src/app/info/wall-of-honor/page.tsx` are replaced with the constant.
- The deadline "March 15, 2027" gets one code home: `WALL_OF_HONOR_DEADLINE_LABEL` in `src/lib/event-config.ts`, interpolated into content defaults (registry.ts already imports from event-config).
- Photos: min 1, max 3, 10 MB each, `image/jpeg`/`image/png`/`image/webp` exactly (bucket mime list and lib constants agree). Tribute cap 1,500 characters.
- The route is NOT rate limited in code; Ryan adds ONE Vercel WAF rule (Request Path starts with `/api/wall-of-honor-submit` AND Method equals POST, 5 req/60 s per IP, Deny) which covers both routes, and verifies by observation before switching the form on (PINUP_REGISTRATION_OPEN comment pattern). The route paths must stay exactly `/api/wall-of-honor-submit` and `/api/wall-of-honor-submit/files`. Say so in the route comment and the session note; Task 7 adds the row to the B2 table in `docs/CUTOVER.md`.
- Consent timestamps are server-set, never client values.

## Review Focus

1. **HEIC/unknown photo type in the manifest** (iPhone that skipped conversion): must come back as a friendly `photos` field error, not a 500 or a signed URL the bucket then refuses. → lib test, Task 2.
2. **Client-supplied `consent_at`** in an insert must be overwritten by the DB stamp, and `tribute` must survive any UPDATE unchanged, even by an admin. → verify_104 controls, Task 1.
3. **Publishing an unapproved or photo-less row** must be unreachable at the database (CHECK), not merely unreported. → verify_104 positive controls, Task 1.
4. **Double-submit** (same email + honoree, double-click or retry) must land as a friendly 409, while a *different* family member submitting the same honoree is accepted. → verify_104 index controls, Task 1; route 23505 branch, Task 3.
5. **Multibyte tribute at the cap**: 1,500 JS characters exactly passes, 1,501 fails, counting matches the form's live counter (`.length` both sides). → lib test, Task 2.

---

### Task 1: Migration 104 and verify_104

**Files:**
- Create: `supabase/migrations/104_wall_of_honor.sql`
- Create: `supabase/verify/verify_104.sql`

**Interfaces:**
- Produces: table `public.wall_of_honor_entries`, view `public.wall_of_honor_public`, column `events.wall_of_honor_open`, buckets `wall-of-honor-submissions` (private) and `wall-of-honor` (public). Later tasks read/write exactly these names.

- [ ] **Step 1: Enumerate existing policies**

Run: `npm run verify:local -- --dump-schema` and record in the migration header every policy on `events` and every `storage.objects` policy whose qual/with_check mentions `wall-of-honor` (expected: none). Per rules.md.

- [ ] **Step 2: Write `supabase/migrations/104_wall_of_honor.sql`**

Header comments follow 091/093 (what, why, the enumeration from Step 1, "delivered, not applied"). Contents, in one `begin; ... commit;`:

1. **Table** `public.wall_of_honor_entries`:
   - `id uuid primary key default gen_random_uuid()`
   - `event_id uuid not null references public.events(id)`
   - `status text not null default 'pending'` CHECK in (`pending`,`approved`,`rejected`,`withdrawn`)
   - `is_published boolean not null default false`, `published_at timestamptz`
   - `submitted_at timestamptz not null default now()`, `decided_at timestamptz`, `decided_by uuid references auth.users(id) on delete set null`, `admin_notes text`
   - Honoree: `honoree_name text not null`, `honoree_rank text`, `branch text not null`, `unit text`, `service_years text`, `tribute text not null`, `tribute_display text`
   - Photos: `photo_paths text[] not null default '{}'`, `public_photo_paths text[] not null default '{}'`, each CHECK `cardinality(...) <= 3`
   - Submitter (never public): `submitter_name text not null`, `submitter_relationship text not null`, `submitter_email text not null`, `submitter_phone text`
   - Consent: `consent_at timestamptz not null default now()`, `consent_social boolean not null default false`
   - Print: `include_in_print boolean not null default true`
   - CHECK nonempty: `btrim(honoree_name) <> ''`, `btrim(branch) <> ''`, `btrim(tribute) <> ''`, `btrim(submitter_name) <> ''`, `btrim(submitter_email) <> ''`
   - Column comments for status, tribute vs tribute_display, photo_paths vs public_photo_paths (which bucket each lives in).
2. **Paths-in-own-folder helper** (CHECK cannot subquery an array otherwise):
   `create or replace function public.paths_under_folder(p_paths text[], p_folder text) returns boolean language sql immutable` returning `coalesce((select bool_and(p like p_folder || '/%') from unnest(p_paths) p), true)`; `revoke execute ... from public, anon, authenticated` BY NAME (function-grants.test.ts rule). Table CHECKs: `paths_under_folder(photo_paths, id::text)` and the same for `public_photo_paths`.
3. **Publish invariant** (make the invalid state unreachable): CHECK
   `not is_published or (status = 'approved' and cardinality(public_photo_paths) >= 1)`
   (name and branch nonemptiness already hold table-wide).
4. **Duplicate guard**: `create unique index wall_of_honor_one_active_per_submitter_honoree on public.wall_of_honor_entries (event_id, lower(submitter_email), lower(btrim(honoree_name))) where status in ('pending','approved')` so a rejected or withdrawn entry does not block a resubmit, and a different email for the same honoree is never blocked.
5. **Guard trigger** `wall_of_honor_guard()` (security definer, search_path pinned, revoked by name; BEFORE INSERT OR UPDATE):
   - INSERT: `new.consent_at := now()` unless the trusted-import context holds: `auth.uid() is null AND coalesce(current_setting('aatc.woh_import', true), '') = 'on'` (the PR 3 WordPress import runs as service role or direct SQL and sets it). The `auth.uid() is null` arm is load-bearing: an authenticated session (even an admin) can never use the setting to backdate consent, and a normal form submission (route sends no `consent_at`) always gets the DB stamp. Non-admin authenticated inserts (belt and braces; no policy allows them) forced to `status='pending', is_published=false`, decision/publish columns nulled.
   - UPDATE: `new.tribute := old.tribute` (immutable for everyone, admins included); `new.consent_at := old.consent_at`; `new.consent_social := old.consent_social`; `new.submitted_at := old.submitted_at`. When `auth.uid() is not null and not public.is_admin()`: revert status, is_published, published_at, decided_at, decided_by, admin_notes, tribute_display, include_in_print, public_photo_paths (090/091 staff-column pattern).
6. **RLS**: `alter table ... enable row level security`; one policy `"wall_of_honor: admin all"` FOR ALL TO authenticated USING/WITH CHECK `public.is_admin()` (decision 8: admins only, not content editors); `revoke all on public.wall_of_honor_entries from anon` so anon gets permission denied, not an empty set.
7. **View** `public.wall_of_honor_public` `with (security_invoker = false, security_barrier = true)` (099 pattern): `id, honoree_name, honoree_rank, branch, unit, service_years, coalesce(tribute_display, tribute) as tribute, public_photo_paths as photo_paths, published_at` from entries joined to `events ev on ev.id = event_id and ev.is_active`, `where is_published`. No submitter column is referenced. `grant select ... to anon, authenticated` + comment.
8. **Switch**: `alter table public.events add column if not exists wall_of_honor_open boolean not null default false` + comment ("form and route read it; toggled on /admin/wall-of-honor; stays off until the WAF rule is verified").
9. **Buckets** (093 pattern, `on conflict (id) do update`):
   - `wall-of-honor-submissions`: public=false, 10485760, `{image/jpeg,image/png,image/webp}`; exactly one storage policy, `"wall-of-honor-submissions: admin read"` FOR SELECT TO authenticated USING `bucket_id = 'wall-of-honor-submissions' and public.is_admin()`. No INSERT/UPDATE/DELETE policy: uploads arrive only through signed upload URLs from the route.
   - `wall-of-honor`: public=true, 10485760, same types; no policies (only the service role writes it, from PR 2's publish).

- [ ] **Step 3: Write `supabase/verify/verify_104.sql`**

Blocks per verify_093/098 style; all test rows under an INACTIVE event `'ZZ VERIFY 104 (DELETE ME)'`, deleted at the end:

- **A (structure):** both buckets exist with exact public flag, limit and the 3-element mime array; exactly 1 `pg_policies` row on storage.objects mentions `wall-of-honor-submissions` (admin read, SELECT, `is_admin`) and 0 non-submissions policies mention the `wall-of-honor` bucket (match `%wall-of-honor%` then subtract `%wall-of-honor-submissions%` matches); table exists with every column, RLS enabled, exactly 1 table policy; `has_table_privilege('anon', 'public.wall_of_honor_entries', 'select')` is false (positive control: anon cannot read entries); `has_table_privilege('anon', 'public.wall_of_honor_public', 'select')` is true; trigger and unique index exist; `events.wall_of_honor_open` exists with default false.
- **B (behavior):** insert a pending entry supplying `consent_at = '2000-01-01'` → stored `consent_at` is recent (stamp wins); `set_config('aatc.woh_import','on',true)` then insert (auth.uid() null in the verify session) → supplied value kept; **positive control for the escape hatch**: with the admin harness identity active (`request.jwt.claims` sub set to the admin, the pattern the existing verifies use), set `aatc.woh_import = 'on'` and insert a backdated `consent_at` → the stamp still wins, because `auth.uid()` is not null; reset the identity after; UPDATE tribute → unchanged after; UPDATE `is_published = true` on the pending row → check_violation (positive control); approve it, publish with empty `public_photo_paths` → check_violation; set `public_photo_paths = array[id || '/photo-0-x.jpg']` and publish → succeeds; a path outside the entry's folder → check_violation; second insert, same email + same honoree name (case-shifted) → unique_violation; same honoree from a different email → succeeds.
- **C (view as anon):** `set local role anon;` select the published row from `wall_of_honor_public` → exactly 1 row, honoree fields present, `tribute` reads `coalesce(tribute_display, tribute)` (set a `tribute_display` first and assert the view shows it while the table keeps the original); assert the view's column list contains no `submitter%` column (information_schema); select from the table as anon → expect `insufficient_privilege` (positive control, caught exception).

- [ ] **Step 4: Run the verify locally**

Run: `npm run verify:local -- supabase/verify/verify_104.sql` → PASS, then `npm run verify:local -- --audit` → PASS. Fix until both pass (never by hand-writing a minimal schema).

- [ ] **Step 5: Run the test suite** (function-grants rule covers 104 automatically)

Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

`git add supabase/migrations/104_wall_of_honor.sql supabase/verify/verify_104.sql && git commit` ("feat(wall-of-honor): 104 - entries table, buckets, switch, public view (delivered, not applied)").

---

### Task 2: Validation lib

**Files:**
- Create: `src/lib/wall-of-honor-submission.ts`
- Test: `src/lib/wall-of-honor-submission.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 5, 6):
  - `BRANCHES = ['Army','Marine Corps','Navy','Air Force','Space Force','Coast Guard'] as const`, `BRANCH_OTHER = 'Other'` (decision 1 default: Guard/Reserve members are listed under their branch; Other takes free text, max 60)
  - `RELATIONSHIPS = ['Parent','Spouse','Child','Sibling','Other family','Friend','Fellow service member'] as const`, `RELATIONSHIP_OTHER = 'Other'`
  - `TRIBUTE_MAX = 1500`, `WOH_PHOTO_MIN_COUNT = 1`, `WOH_PHOTO_MAX_COUNT = 3`, `WOH_PHOTO_MAX_BYTES = 10 * 1024 * 1024`
  - `WOH_IMAGE_TYPES: Record<string,string> = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }`, `WOH_IMAGE_ACCEPT` (joined keys)
  - `WOH_SUBMISSIONS_BUCKET = 'wall-of-honor-submissions'`, `WOH_PUBLIC_BUCKET = 'wall-of-honor'`
  - `interface WallOfHonorValues { honoree_name: string; honoree_rank: string | null; branch: string; unit: string | null; service_years: string | null; tribute: string; submitter_name: string; submitter_relationship: string; submitter_email: string; submitter_phone: string | null; consent_social: boolean; photos: { ext: string; contentType: string }[] }`
  - `validateWallOfHonorSubmission(body: Record<string, unknown>): { ok: true; values: WallOfHonorValues } | { ok: false; fieldErrors: Record<string, string> }`
  - `entryPhotoPath(entryId: string, index: number, ext: string, rand: string): string` → `` `${entryId}/photo-${index}-${rand}.${ext}` `` (the index prefix keeps "first photo is main" stable however uploads race; `/files` sorts by name)
  - `photoQuality(minSidePx: number): 'good' | 'usable' | 'low'` (>= 1200 good, >= 700 usable: the import-wall-of-honor.mjs thresholds)
  - `duplicateHonoreeKey(name: string, branch: string): string` (lowercase, trimmed, inner whitespace collapsed, joined with `|`) for the admin "possible duplicate" marker

- [ ] **Step 1: Write the failing tests** (follow food-truck-submission.test.ts style). Body field names the form posts: `honoreeName, rank, branch, branchOther, unit, serviceYears, tribute, yourName, relationship, relationshipOther, email, phone, consent, consentSocial, files` (manifest entries `{ type, size }`). Cases:

```ts
// a full valid body returns ok with trimmed values, nulls for empty optionals
// missing honoreeName / branch / tribute / yourName / relationship / email -> that fieldError
// branch 'Other' requires branchOther (max 60); unknown branch string -> fieldErrors.branch
// relationship 'Other' requires relationshipOther; unknown -> fieldErrors.relationship
// bad email shape -> fieldErrors.email
// consent !== true -> fieldErrors.consent
// tribute of exactly 1500 chars passes; 1501 -> fieldErrors.tribute (use '✊'.repeat? no: use 'a'.repeat(1500) and a 1501 multibyte string, asserting .length semantics)
// files: [] -> fieldErrors.photos (at least one); 4 entries -> fieldErrors.photos (up to 3)
// files: [{ type: 'image/heic', size: 1000 }] -> fieldErrors.photos naming JPG, PNG or WebP
// files: [{ type: 'image/jpeg', size: WOH_PHOTO_MAX_BYTES + 1 }] -> fieldErrors.photos (10 MB)
// entryPhotoPath('abc', 0, 'jpg', 'r1') === 'abc/photo-0-r1.jpg'
// photoQuality(1200) 'good'; (1199) 'usable'; (700) 'usable'; (699) 'low'
// duplicateHonoreeKey('  John  SMITH ', 'army') === duplicateHonoreeKey('John Smith', 'Army')
```

- [ ] **Step 2: Run to verify failure** — `npm test -- wall-of-honor-submission` → FAIL (module not found).
- [ ] **Step 3: Implement the lib** (model: validateFoodTruckSubmission; `str()` trims and caps: honoree_name/unit/submitter_name 200, rank/service_years 100, email 254, phone 40; tribute NOT silently sliced: over-cap is a field error, since silent truncation would alter a family's words).
- [ ] **Step 4: Run tests** — `npm test -- wall-of-honor-submission` → PASS.
- [ ] **Step 5: Commit** ("feat(wall-of-honor): submission validation lib").

---

### Task 3: Email templates, route and /files

**Files:**
- Modify: `src/lib/email-templates.ts` (two new functions at the end, near the food-truck ones)
- Create: `src/app/api/wall-of-honor-submit/route.ts`
- Create: `src/app/api/wall-of-honor-submit/files/route.ts`

**Interfaces:**
- Consumes: Task 2's lib; `botTrapRejection` (`src/lib/bot-trap.ts`), `sendTransactional` (`src/lib/transactional-email.ts`), `CONTACT_EMAIL` (409 copy) and `WALL_OF_HONOR_EMAIL` (notice + receipt questions line; Task 4 adds it — if Task 3 runs first, add the constant in Task 3 and Task 4 keeps it).
- Produces: `wallOfHonorReceivedEmail(f: { honoreeName: string; submitterName: string })` and `internalNewWallOfHonorEmail(f: { honoreeName: string; branch: string; submitterName: string; relationship: string; email: string; phone: string | null; photoCount: number })`, both returning `emailWrapper(...)` HTML.

- [ ] **Step 1: Add the two templates.** Receipt copy (submitter-facing, plain and warm, no invented claims): thanks them for honoring `honoreeName`; "Every tribute is reviewed by our team before it appears. We will email you when it is on the Wall."; questions to `WALL_OF_HONOR_EMAIL` via the existing wrapper conventions. Internal notice lists the facts and the admin page path `/admin/wall-of-honor`.
- [ ] **Step 2: Write `route.ts`** as a line-for-line sibling of `/api/food-truck-apply/route.ts`:
  1. parse body, `botTrapRejection` first (honeypot `website`, `elapsedMs`)
  2. `validateWallOfHonorSubmission`
  3. active event via service role: `select id, wall_of_honor_open from events where is_active`; 503 when missing; when `!wall_of_honor_open` → 403 `{ error: 'Wall of Honor submissions are closed.', closed: true }` (route is the gate; the page shows the editable closed message)
  4. insert `{ event_id, status:'pending', is_published:false, honoree fields, submitter fields, consent_social }` — never `consent_at` (DB stamps it); on `23505` → 409 "We already have a tribute for {honoree_name} from this email. To change it, email {CONTACT_EMAIL}." with `fieldErrors.email`
  5. one `createSignedUploadUrl` per photo into `WOH_SUBMISSIONS_BUCKET` at `entryPhotoPath(id, index, ext, crypto.randomUUID())`; a failure loses a photo, never the submission
  6. receipt to submitter and internal notice to `WALL_OF_HONOR_EMAIL` (event-config, Task 4 adds it; receipt "questions" line also uses it) via `sendTransactional`, each in its own try/catch, failures logged only
  7. return `{ id, uploads, uploadsMissing }`

  Top comment: model attribution (091/093), the 4.5 MB body-cap reason, and **NOT RATE LIMITED in code — ONE Vercel WAF rule (path starts with `/api/wall-of-honor-submit`, POST, 5/60s per IP, Deny) covers this route and `/files`; Ryan verifies it by observation before `events.wall_of_honor_open` is switched on** (pinup precedent in event-config). Renaming these paths silently abandons the WAF rule; CUTOVER.md B2 lists it.
- [ ] **Step 3: Write `files/route.ts`** as a sibling of `/api/food-truck-apply/files/route.ts`: body `{ id }` (UUID-checked); load `id, status, submitted_at, photo_paths`; refuse 409 unless status `pending`, within 24 h of `submitted_at`, and `photo_paths` is empty (fills empty fields only); `list(id)` on the submissions bucket, keep objects whose name starts `photo-`, sort by name, take 3, update `photo_paths`; return `{ photos: n }`.
- [ ] **Step 4: Verify** — `npm test` → PASS; `npm run build` → PASS (routes compile; prebuild guards).
- [ ] **Step 5: Commit** ("feat(wall-of-honor): submit route, files recorder, receipt + notice emails").

---

### Task 4: Content entries, deadline home, /apply card

**Files:**
- Modify: `src/lib/event-config.ts` (two constants), `src/content/registry.ts` (new page + two default edits), `src/app/apply/page.tsx` (card href), `src/app/info/wall-of-honor/page.tsx` (mailto literals only)
- Test: existing `src/content/registry.test.ts` and suite must stay green

**Interfaces:**
- Produces: `WALL_OF_HONOR_DEADLINE_LABEL = 'March 15, 2027'` and `WALL_OF_HONOR_EMAIL = 'wallofhonor@allamericantattooconvention.com'` (event-config, next to `CONTACT_EMAIL`, comments naming each the one code home; mailbox confirmed by Ryan 2026-10-22); registry page `key: 'wallOfHonorSubmit'` whose entry keys Task 5 reads via `getContent('wallOfHonorSubmit')`.

- [ ] **Step 1: Add the two constants and the registry page.** Also replace the two hard-coded `wallofhonor@allamericantattooconvention.com` mailto links in `src/app/info/wall-of-honor/page.tsx` (~lines 150 and 199-200) with `WALL_OF_HONOR_EMAIL` imported from event-config; no other change to that page (its rewrite is PR 2). Entries (label, type, default) — defaults interpolate `WALL_OF_HONOR_DEADLINE_LABEL`, never restate the date:
  - `intro_title` text: `Wall of Honor Submission`
  - `intro_body` markdown: who the Wall is for, decision 1 default. Default copy: `The Wall of Honor remembers service members who died while serving. If you are a Gold Star family member or are submitting with the family's permission, we invite you to share your hero's story for display at the convention and on our website.`
  - `deadline_line` text default: `` `Submissions close ${WALL_OF_HONOR_DEADLINE_LABEL}.` ``
  - `review_note` text default: `Every tribute is reviewed by our team before it appears. We will email you when it is on the Wall.`
  - `consent_label` text default (spec wording verbatim): `I am a family member or have the family's permission. I have the right to share these photos. AATC may show this tribute on its website and print it for display at the convention.`
  - `consent_social_label` text default: `AATC may also share this tribute on its social media.` (decision 6: optional, nothing posted without it)
  - `closed_title` text default: `Submissions are closed`
  - `closed_body` markdown default: `` `Wall of Honor submissions are not open right now. Questions? Email ${WALL_OF_HONOR_EMAIL}.` `` — the constant, never a literal
  - `success_title` text default: `Thank you`
  - `success_body` markdown default: `Your tribute was received. Our team reviews every submission before it appears on the Wall, and we will email you when it is up.`
- [ ] **Step 2: Align the existing copy.** In `registry.ts`: narrow `honor_body`'s default to the decision-1 wording (drop "distinguished veterans"; keep it one sentence, same voice); update the applyHub `deadline_title`/`deadline_body` defaults to interpolate `WALL_OF_HONOR_DEADLINE_LABEL` with the text otherwise unchanged. In `src/app/apply/page.tsx:36` point the honor card `href` at `/info/wall-of-honor/submit`. (If live DB content overrides exist for `honor_body`/deadline entries, the defaults will not show; the session note tells Ryan to re-check those two entries in /admin/content.)
- [ ] **Step 3: Verify** — `npm test` → PASS; `npm run build` → PASS.
- [ ] **Step 4: Commit** ("feat(wall-of-honor): form copy entries, deadline label one home, apply card link").

---

### Task 5: Public form page

**Files:**
- Create: `src/app/info/wall-of-honor/submit/page.tsx` (server), `src/app/info/wall-of-honor/submit/WallOfHonorSubmitClient.tsx` (client)

**Interfaces:**
- Consumes: Task 2 constants (`BRANCHES`, `RELATIONSHIPS`, `TRIBUTE_MAX`, `WOH_IMAGE_ACCEPT`, `WOH_PHOTO_MAX_COUNT`, `WOH_PHOTO_MAX_BYTES`), Task 4 content keys, routes from Task 3.

- [ ] **Step 1: Server page**, modeled on `src/app/apply/food-truck/page.tsx`: `pageMetadata('/info/wall-of-honor/submit', ...)`; `getContent('wallOfHonorSubmit')`; `events.wall_of_honor_open` via a cookieless anon client in `unstable_cache` (60 s, tag `'wall-of-honor'`; the admin page purges it on save, Task 6); closed → render `closed_title`/`closed_body`; open → render the client form with the content strings as props.
- [ ] **Step 2: Client form**, modeled on `FoodTruckApplyClient.tsx` (same submit flow: POST manifest → upload each file to its signed URL with `uploadToSignedUrl`/PUT per the food-truck client's exact mechanism → POST `/files` → success panel showing `success_title`/`success_body`). Fields per spec: honoree (full name required; rank; branch pick-list + Other free text; unit; years of service free text e.g. placeholder `2004-2011`); photos `accept={WOH_IMAGE_ACCEPT}` min 1 max 3 with "The first photo is the main photo" helper line and client-side size/type checks before submit; tribute textarea with live `{tribute.length} / {TRIBUTE_MAX}` counter; about-you (name, relationship pick-list + Other, email, phone optional); required consent checkbox labeled `consent_label`, optional `consent_social_label` checkbox; honeypot `website` field and `elapsedMs` exactly as the food-truck client does; field errors rendered from the route's `fieldErrors`. No copy hard-coded that Task 4 made an entry for.
- [ ] **Step 3: Verify** — `npm run build` → PASS; `npm test` → PASS.
- [ ] **Step 4: Commit** ("feat(wall-of-honor): public submission form").

---

### Task 6: Admin review page

**Files:**
- Create: `src/app/admin/wall-of-honor/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx` (nav item `Wall of Honor` → `/admin/wall-of-honor`, beside Pinup Entries at ~line 94)

**Interfaces:**
- Consumes: Task 2's `photoQuality`, `duplicateHonoreeKey`, `WOH_SUBMISSIONS_BUCKET`, `TRIBUTE_MAX`; table and switch from Task 1 (admin RLS policy; "events: admin write" already exists, no new policy).

- [ ] **Step 1: Build the page**, modeled on `src/app/admin/pinup/page.tsx` / `src/app/admin/food-trucks/page.tsx` conventions (client page, authenticated admin supabase client, same list/detail layout and revalidate-tag purge pattern the food-trucks admin uses for its switch — purge tag `'wall-of-honor'`):
  - Top: `events.wall_of_honor_open` toggle + "N pending" count.
  - List: status filter (default pending), honoree, branch, submitter + relationship, submitted date, photo count (`photo_paths.length`), published flag, and a "possible duplicate" badge when two entries share `duplicateHonoreeKey(honoree_name, branch)`.
  - Detail: every field; photos via `createSignedUrl` on the submissions bucket (admin read policy), each showing `naturalWidth x naturalHeight` once loaded and the `photoQuality(min side)` verdict; submitter contact; `admin_notes` editor.
  - Actions: **Approve** (`status='approved', decided_at=now, decided_by=user.id`), **Reject** (same with `'rejected'`; NO email: spam is silent, Ryan writes to real families himself), **Edit display fields** (honoree_name, honoree_rank, branch, unit, service_years, tribute_display; the original `tribute` always rendered read-only beside `tribute_display`), **Include in print** toggle. No publish/unpublish control (PR 2); `is_published` shown read-only.
- [ ] **Step 2: Verify** — `npm run build` → PASS; `npm test` → PASS.
- [ ] **Step 3: Commit** ("feat(admin): Wall of Honor review page and nav item").

---

### Task 7: Session note, final verification, PR

**Files:**
- Create: `docs/handoff/sessions/2026-10-22-wall-of-honor-submissions.md` (the branch's ONLY handoff edit; no other handoff file changes)
- Modify: `docs/CUTOVER.md` section B2 (Ryan asked for this row, 2026-10-22): change "Exactly TWO active rules" to THREE and add the table row `| `/api/wall-of-honor-submit` (path prefix, covers `/files`) | POST | 5 requests / 60s per IP, Deny 403 |`

- [ ] **Step 1: Write the session note**: what PR 1 adds; migration 104 + verify_104 delivered NOT applied (Ryan runs the migration, then pastes the verify and reads the MESSAGES pane, per the verify header); both verify commands passed locally (paste the PASS lines); the launch gate: Ryan adds ONE Vercel WAF rule (path starts with `/api/wall-of-honor-submit`, POST, 5 req/60 s/IP, Deny — covers both routes; now listed in CUTOVER.md B2), verifies by observation (pinup precedent), THEN flips the admin switch; decisions as built (defaults 1-12, with decision 7 resolved to `WALL_OF_HONOR_EMAIL`); content follow-up for Ryan (re-check live overrides of `honor_body` and the deadline strip in /admin/content); PR 2/PR 3 scope unchanged.
- [ ] **Step 2: Full verification** (superpowers:verification-before-completion): `npm test` → PASS, `npm run build` → PASS, `npm run verify:local -- supabase/verify/verify_104.sql` → PASS, `npm run verify:local -- --audit` → PASS. Paste outputs in the PR body.
- [ ] **Step 3: Push and open the PR** against `develop` (never stacked): title "feat(wall-of-honor): public submissions, admin review (PR 1 of 3)"; body: summary, the verify evidence, "migration delivered, not applied", the WAF-before-switch gate, decisions built as defaults. End with the attribution line. Do not merge: develop is production; Ryan merges.
