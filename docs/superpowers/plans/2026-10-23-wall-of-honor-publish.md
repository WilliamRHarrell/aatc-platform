# Wall of Honor Publish (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approved tributes get published to a permanent, multi-year public Wall at `/info/wall-of-honor` (photos copied to the public bucket, "now on the Wall" email on first publish, imports excluded), with publish/unpublish in the admin and the page's unconfirmed claims removed.

**Architecture:** Migration 105 recreates `wall_of_honor_public` without the active-event filter and appends `event_year` from `events.start_date` (one home for the year), and extends the guard trigger to stamp `published_at`. Publishing is a server-only admin API route (photos cross buckets, so the service role does the copy; the row update is the gate, per the rules.md rollback rule). The public page becomes a server component reading the view, grouped by year, with its copy in the content registry.

**Tech Stack:** Next.js App Router, Supabase (Postgres/RLS/Storage), Resend via `sendTransactional`, vitest.

**Spec:** Ryan's 2026-10-22 Wall of Honor spec (PR 2 section) + his 2026-10-23 decisions, both recorded in `docs/handoff/sessions/2026-10-22-wall-of-honor-submissions.md` (merged, PR #114): permanent multi-year wall; skip the publish email for imported WordPress tributes; remove the "separate quiet area" and "tokens returned to families" claims and "accepted on a rolling basis" until Ryan confirms; sweep the route comment's 5/60s to point at CUTOVER B2.

## Global Constraints

- Branch `feat/wall-of-honor-publish` off `origin/develop` in `../aatc-platform-claude`. No stacked PRs. Migration number is **105** (confirmed free across all remote branches). Delivered, not applied; 104 must be applied first and the header says so.
- Never edit migration 104 (it may be applied). 105 `create or replace`s the view and the guard FUNCTION; per rules.md "replacing a view", the header pins the expected live column list (104's nine, in order) and verify_105 pins the result; appending `event_year` is the only column change Postgres allows.
- `npm run verify:local -- supabase/verify/verify_105.sql` and `--audit` must both pass before delivery; storage tables never written from a verify.
- Rollback rule (rules.md): a write spanning a file and a row rolls back in the direction of the visible failure. Publish: copy photos first, row update is the gate, failed gate deletes the copies. Unpublish: row first (closes the view), then delete public objects, a failed deletion is surfaced to the admin, never silent.
- First-publish email ONLY when `imported_at IS NULL`, `published_email_sent_at IS NULL`, and `submitter_email` is nonempty. A mail failure never fails the publish. Republish never re-emails and keeps the original `published_at`.
- Copy rules: no placeholder people or invented claims; the three claims Ryan held come OUT of the page (removable copy lives in content entries so confirmed claims can return by edit, but the held claims get no entry at all until he confirms). No em dashes in src/. Dates/emails only via `WALL_OF_HONOR_DEADLINE_LABEL` / `WALL_OF_HONOR_EMAIL` / `CONTACT_EMAIL`.
- Public photo paths in the public `wall-of-honor` bucket reuse the entry's private path strings unchanged (`<entry id>/photo-<i>-<rand>.<ext>`), satisfying the 104 CHECK on `public_photo_paths`.
- Registry rules: a new registry page needs its `PAGE_ROUTE` entry and its path in `ALLOWED_PATHS` (registry.test.ts enforces both).
- Push + PR happen only after the final whole-branch review (PR 1 precedent). Ryan merges; develop is production.

## Review Focus

1. **A publish whose photo copy partially fails** (an object in `photo_paths` missing or undownloadable): the route must delete any copies already made and return an error, leaving the row unpublished; no half-published tribute. → Task 3 structure; final review inspects the rollback path.
2. **Republish after unpublish**: no second email, original `published_at` preserved. → Task 2 test (`shouldSendPublishEmail`), verify_105 B4/B5.
3. **Unpublish must actually remove the public copies**; a family asking for removal expects it gone, and a failed object deletion must reach the admin's screen. → Task 3 (ordering + `warning` in the response), Task 5 (surface it).
4. **The launch state (zero published rows)** must render the empty state with intact metadata, not a broken grid. → Task 4 Step 4; the existing seo/sitemap tests stay green.
5. **An imported historical tribute** (inactive event, `imported_at` set): visible on the page under its real year, publishable from the admin, and never emailed. → verify_105 B2 (year from an inactive event), Task 2 test, Task 5 import badge.

---

### Task 1: Migration 105, verify_105, and the hand-kept types

**Files:**
- Create: `supabase/migrations/105_wall_of_honor_permanent.sql`, `supabase/verify/verify_105.sql`
- Modify: `src/types/database.ts` (two new entry columns; `wall_of_honor_public` added to Views)

**Interfaces:**
- Produces: view `wall_of_honor_public` with 104's nine columns plus `event_year int`; entry columns `imported_at timestamptz` (NULL = submitted through the form; PR 3's import sets it) and `published_email_sent_at timestamptz`; guard stamping `published_at := coalesce(old.published_at, now())` on the false→true transition of `is_published`. Types for all of it.

- [ ] **Step 1: Enumerate** — `npm run verify:local -- --dump-schema`; record in the header the policies on the touched objects (expected: unchanged from 104) and the live view column list rule (rules.md: 065/047 precedent; 104 must be applied before 105).
- [ ] **Step 2: Write the migration.** One `begin;…commit;`:
  1. `alter table public.wall_of_honor_entries add column if not exists imported_at timestamptz, add column if not exists published_email_sent_at timestamptz;` + comments (imported_at: set only by the PR 3 WordPress import; rows with it never get the publish email. published_email_sent_at: set by the publish route after the first-publish email sends).
  2. `create or replace function public.wall_of_honor_guard()` — 104's body EXACTLY (read it from the file), plus: in the UPDATE arm, when `new.is_published and not old.is_published` then `new.published_at := coalesce(old.published_at, now())`; when `not new.is_published` then `new.published_at := old.published_at` (unpublish never clears the first-publish time); and the non-admin revert list gains `imported_at` and `published_email_sent_at`. The function keeps its existing revoke-by-name lines (function-grants.test.ts).
  3. `create or replace view public.wall_of_honor_public` — identical select list and order to 104 (id, honoree_name, honoree_rank, branch, unit, service_years, coalesce-tribute, photo_paths, published_at) with `extract(year from ev.start_date)::int as event_year` APPENDED; join drops `and ev.is_active`; `where w.is_published` stays; same `security_invoker = false, security_barrier = true`; re-`grant select` to anon, authenticated; comment updated (permanent across years; year derives from the event row).
- [ ] **Step 3: Write verify_105** (fixtures on an INACTIVE `'ZZ VERIFY 105 (DELETE ME)'` event with a past `start_date`, e.g. its year ≠ the active event's; everything deleted at the end):
  - A: view exists with EXACTLY the ten columns in order (pin the list); anon/authenticated have SELECT on the view and anon still lacks it on the table; both new columns exist; no submitter column in the view (information_schema allow-list).
  - B1: approved entry with a public photo path on the INACTIVE event, publish via trusted update → the row IS in the view and `event_year = extract(year from that event's start_date)` (the permanence control).
  - B2: an unpublished sibling row stays out of the view.
  - B3: the publish in B1 supplied no `published_at` → it is non-null and recent (the stamp).
  - B4: unpublish then republish → `published_at` unchanged from B3's value.
  - B5: under the admin harness identity, an UPDATE supplying `imported_at`/`published_email_sent_at` changes reach the row ONLY per the guard (admin allowed; then `set local role authenticated` with a non-admin identity → reverted). Follow 104's B3 harness conventions exactly.
  - C: `set local role anon` → view returns the published ZZ row (inactive event!), table select raises insufficient_privilege.
- [ ] **Step 4: Types.** Add the two columns to `wall_of_honor_entries` Row/Insert/Update and a `wall_of_honor_public` entry to the Views section (model: `sponsors_public`; all ten columns, `Row` only, matching nullability — `event_year: number | null` since extract over a join is nullable in generated types; honoree_rank/unit/service_years/tribute_display-coalesce nullable as in the table).
- [ ] **Step 5: Verify** — `npm run verify:local -- supabase/verify/verify_105.sql` → PASS; `npm run verify:local -- --audit` → PASS; `npm test` → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit.**

---

### Task 2: Publish rules lib and the email template

**Files:**
- Create: `src/lib/wall-of-honor-publish.ts`; Test: `src/lib/wall-of-honor-publish.test.ts`
- Modify: `src/lib/email-templates.ts` (one function, near the other wall-of-honor templates)

**Interfaces:**
- Consumes: nothing new (types from Task 1).
- Produces (Tasks 3, 4, 5 import these verbatim):
  - `canPublish(e: { status: string; photo_paths: string[] }): { ok: true } | { ok: false; reason: string }` — ok iff status === 'approved' and photo_paths.length >= 1; reasons name the gap in admin-facing words.
  - `shouldSendPublishEmail(e: { imported_at: string | null; published_email_sent_at: string | null; submitter_email: string }): boolean` — the Global Constraints rule, exactly.
  - `groupByEventYear<T extends { event_year: number | null }>(rows: T[]): { year: number | null; rows: T[] }[]` — years descending, null years last, input order preserved within a year.
  - `wallOfHonorPublishedEmail(f: { honoreeName: string; submitterName: string; wallUrl: string }): string` in email-templates.ts via `emailWrapper`: states the tribute to `honoreeName` is now on the Wall of Honor, links `wallUrl`, thanks them; questions line uses `WALL_OF_HONOR_EMAIL`; no other claims.

- [ ] **Step 1: Failing tests** (TDD): canPublish — approved+1 photo ok; pending / approved+0 photos / rejected each `{ok:false}` with distinct reasons. shouldSendPublishEmail — true for `{null, null, 'a@b.co'}`; false when imported_at set, when published_email_sent_at set, when email ''. groupByEventYear — `[2027, 2026, 2027, null]` rows → groups `[2027(2), 2026(1), null(1)]` with stable inner order. Template — contains honoreeName, wallUrl, WALL_OF_HONOR_EMAIL.
- [ ] **Step 2: Run** → FAIL (module not found). **Step 3: Implement.** **Step 4: Run** → PASS; full `npm test` → PASS. **Step 5: Commit.**

---

### Task 3: Admin publish/unpublish route

**Files:**
- Create: `src/app/api/admin/wall-of-honor/publish/route.ts`

**Interfaces:**
- Consumes: Task 2's `canPublish`, `shouldSendPublishEmail`, `wallOfHonorPublishedEmail`; `WOH_SUBMISSIONS_BUCKET`, `WOH_PUBLIC_BUCKET` from `src/lib/wall-of-honor-submission.ts`; `sendTransactional`; `SITE_URL` from `src/lib/site.ts` for `wallUrl` = `${SITE_URL}/info/wall-of-honor`.
- Produces: `POST /api/admin/wall-of-honor/publish`, body `{ id: string(uuid), publish: boolean }` → 200 `{ is_published, published_at, emailSent: boolean, warning?: string }`; 401/403 non-admin; 404 unknown id; 409 `{ error }` when `canPublish` refuses; 500 on a rolled-back copy failure.

- [ ] **Step 1: Implement the route**, modeling auth EXACTLY on `src/app/api/admin/food-truck-docs/route.ts` (admin check first, then a service-role client for the work). Behavior, in order:
  - **Publish:** load the entry; already published → 200 idempotent (no copy, no email). `canPublish` refuse → 409. Copy each `photo_paths` object private→public (`download` then `upload` with the same path and contentType, `upsert: true`); ANY copy failure → delete the public objects copied so far, 500, row untouched. Then update `{ is_published: true, public_photo_paths: <the same paths> }` (trigger stamps `published_at`); update failure → delete all public copies, 500. Then `shouldSendPublishEmail` → send; on send success set `published_email_sent_at` (its own update; failure to SET is logged, not fatal); send failure logged, `emailSent: false`.
  - **Unpublish:** update `{ is_published: false, public_photo_paths: [] }` FIRST; then remove the public objects; removal failure → 200 with `warning` naming the paths still public (the admin must see it; Task 5 renders it).
  - Both paths finish with `revalidatePath('/info/wall-of-honor')` and `revalidateTag('wall-of-honor')` (direct next/cache calls; this route runs in the same app).
- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm test` → PASS; `npm run build` → PASS (route listed). **Step 3: Commit.**

---

### Task 4: Public page rewrite and its content entries

**Files:**
- Modify: `src/app/info/wall-of-honor/page.tsx` (client → server, full rewrite), `src/content/registry.ts` (new page `wallOfHonor` + its PAGE_ROUTE), `src/lib/revalidate-paths.ts` (add `/info/wall-of-honor` to ALLOWED_PATHS)
- Possibly create: a small client lightbox component beside the page (only if `src/components/` has no reusable one — check first)

**Interfaces:**
- Consumes: Task 1's view + types; Task 2's `groupByEventYear`; `getContent('wallOfHonor')`; `WALL_OF_HONOR_DEADLINE_LABEL`.
- Produces: registry page key `wallOfHonor`, entries `intro_title`, `intro_body`, `how_title`, `how_body`, `empty_state`, `submit_cta`.

- [ ] **Step 1: Content entries.** Defaults adapted from the CURRENT page's copy with Ryan's removals applied — these lines go and get no entry at all until he confirms them: the "quiet, contemplative space within the convention" sentence (page.tsx:55), the whole "dedicated area … separate from the main convention floor" paragraph (:184), the whole flowers/coins/tokens paragraph (:187), and "accepted on a rolling basis" (:167). The `how_body` default states what IS true: tributes are submitted at the form (link), reviewed by the team, a receipt email confirms arrival, and submissions close `${WALL_OF_HONOR_DEADLINE_LABEL}`. `empty_state` keeps the current page's empty-state copy. Add `PAGE_ROUTE.wallOfHonor = '/info/wall-of-honor'` and the ALLOWED_PATHS entry (registry.test.ts enforces both).
- [ ] **Step 2: Rewrite the page as a server component**: delete `FEATURED_HONOREES` and the two email-instruction blocks; read the view with a cookieless anon client inside `unstable_cache` (60 s, tag `'wall-of-honor'`), ordered `published_at desc`; `groupByEventYear`; year headings (descending; a null year renders without a heading); honoree card = main photo (`public_photo_paths→photo_paths[0]` via the public bucket's public URL), name, rank, branch, unit, years, tribute; extra photos open in the lightbox (reuse an existing component from `src/components/` if one fits, else a minimal client component in the page's folder). The submit link uses `submit_cta` → `/info/wall-of-honor/submit`. Metadata stays on the existing `layout.tsx` (untouched). Keep visual conventions of the current page (PublicNav, palette) rather than redesigning.
- [ ] **Step 3: Sweep for statements the change makes untrue** (spec): grep the new copy and the registry defaults for "rolling basis", "email the following", "contact you to confirm" — the receipt line must describe the real behavior (an email confirms receipt).
- [ ] **Step 4: Verify** — `npm test` → PASS (registry, seo, sitemap tests); `npm run build` → PASS; confirm `/info/wall-of-honor` still in `ROUTES`/sitemap. **Step 5: Commit.**

---

### Task 5: Admin multi-year scope and publish controls

**Files:**
- Modify: `src/app/admin/wall-of-honor/page.tsx`

**Interfaces:**
- Consumes: Task 2's `canPublish`; Task 3's route; Task 1's columns.

- [ ] **Step 1: Widen the data.** Drop `.eq('event_id', ev.id)` from the entries query; fetch `events (id, name, start_date)` once and map `event_id → year` (`new Date(start_date).getUTCFullYear()`); add a Year column and a year filter (default 'all'); the open/closed switch keeps using the ACTIVE event row only.
- [ ] **Step 2: Publish controls in the detail drawer.** A Publish button enabled iff `canPublish(entry).ok` (disabled state shows the reason), an Unpublish button behind a confirm; both call `POST /api/admin/wall-of-honor/publish` and replace the local row from the response; a `warning` in the response renders as a visible toast/banner (public photos not fully removed). Show `published_at`, an "Imported" badge when `imported_at` is set, and an "email sent" line from `published_email_sent_at`. `EntryPatch` stays as is (publishing never goes through a direct table update).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm test` → PASS; `npm run build` → PASS. **Step 4: Commit.**

---

### Task 6: Route-comment sweep, session note, full verification

**Files:**
- Modify: `src/app/api/wall-of-honor-submit/route.ts` (top comment only)
- Create: `docs/handoff/sessions/2026-10-23-wall-of-honor-publish.md` (this branch's ONLY handoff edit)

- [ ] **Step 1: Sweep the comment.** The NOT-RATE-LIMITED paragraph stops restating numbers: it says the WAF rule's current values and verification history live in `docs/CUTOVER.md` B2, and keeps the warning that renaming the paths silently abandons the rule. No code changes.
- [ ] **Step 2: Session note**: what PR 2 adds; **105 delivered, not applied, after 104**; the four verification outcomes; the three claims REMOVED pending Ryan's confirmation (list them verbatim and say they return as content entries once he confirms); the import-email skip rule and that PR 3's import must set `imported_at`; the publish rollback behavior and the unpublish `warning`; PR 3 scope (print export + import; import sets `imported_at`, uses `aatc.woh_import` from a trusted context, needs the historical event rows from Ryan).
- [ ] **Step 3: Full verification**, outcomes verbatim in the note and the report: `npm test`, `npm run build`, `npm run verify:local -- supabase/verify/verify_105.sql`, `npm run verify:local -- --audit`. All must pass.
- [ ] **Step 4: Commit.** (Push + PR happen after the final whole-branch review.)
