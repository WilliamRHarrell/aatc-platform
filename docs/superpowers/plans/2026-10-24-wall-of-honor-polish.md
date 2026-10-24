# Wall of Honor Polish (PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long tributes clamp to ~8 lines with an accessible Read more; every wall photo gets an admin-set crop focus point used by the public card and thumbnails (default upper-center); the Gold Star passes sentence gains its co-donor and one home shared by both pages.

**Architecture:** Migration 107 adds `photo_focus jsonb` (path → {x,y} percents) with a shape CHECK, extends the guard's non-admin revert list, and appends the column to `wall_of_honor_public` (create or replace, append-only). The admin drawer sets focus by clicking the photo with a live preview at the public card's aspect; saving goes through the existing `saveEntry` and revalidates the wall (allowed while published - no files change). The public page maps focus to `object-position`; the lightbox stays uncropped. The sentence becomes one event-config constant rendered by both pages, with a keep-in-step test.

**Tech Stack:** Next.js App Router, Supabase (Postgres/RLS), next/image, vitest.

**Spec:** Ryan's 2026-10-24 polish request (pasted in session; summarized here). The donor change is Ryan 2026-10-23 and SUPERSEDES the 2026-09-13 correction: the Cumberland County Crown Complex is now a co-donor.

## Global Constraints

- Branch `feat/wall-of-honor-polish` off `origin/develop`. Migration number **107** (confirmed free), delivered not applied, after 106; never edit 104-106. The guard currently in force is 105's `wall_of_honor_guard()` (106 did not replace it); 107's replacement copies that body EXACTLY plus the one addition.
- The sentence, Ryan's wording VERBATIM: "American Tattoo Society and the Cumberland County Crown Complex donate around 50 VIP passes each year for Gold Star family members." ("family" lowercase.) Keep "around 50" - the number varies with Survivor Outreach Services sign-ups. One home: `GOLD_STAR_PASSES_SENTENCE` in `src/lib/event-config.ts`; both pages render the constant; no other copy of the sentence anywhere in src/. The constant's comment records: Ryan 2026-10-23, the Crown is now a co-donor, superseding the 2026-09-13 correction - written so nobody "fixes" it back.
- Focus points: per photo, keyed by the photo's PATH string (private and public copies share path strings), values `{x: number, y: number}` in 0-100. Default when unset: `50% 25%` (upper-center), applied app-side. The DB CHECK makes malformed shapes unreachable (object values with numeric x and y in range); stale keys are pruned on save, ignored on read.
- Focus editing works while PUBLISHED (no unpublish; files don't change) and must revalidate `/info/wall-of-honor` + tag `wall-of-honor` after save via the existing `requestRevalidate`.
- Clamp: ~8 lines (`line-clamp` via inline style or Tailwind arbitrary value), Read more/Show less is a real `<button>` with `aria-expanded`, keyboard focusable, shown ONLY when the text actually overflows; paragraph breaks preserved (`whitespace-pre-line` stays); expansion is in place.
- The lightbox always shows the whole uncropped photo.
- verify_107 + `--audit` pass locally; function-grants rule by name; no em dashes; no literal emails/dates; push + PR only after the final whole-branch review; Ryan merges.

## Review Focus

1. **A tribute right at the clamp boundary** (exactly ~8 lines): the button must not appear when nothing is hidden, including after fonts load or the viewport resizes. → Task 3 overflow detection re-checks on resize; reviewer scrutiny.
2. **A focus save on a published entry** must reach the public wall within the cache window: the save path must call `requestRevalidate` and the wall's cached read must actually be invalidated (tag + path). → Task 4 wiring; reviewer traces it.
3. **Malformed OR missing focus data must be harmless at render**: the DB CHECK makes bad shapes unreachable, and the page must not blank the LIVE wall during the merge-to-apply window (the view lacks `photo_focus` until 107 is applied, and published tributes are on the wall now). → verify_107 negative controls (Task 1); Task 3 reads via `select('*')` with a defensive per-photo reader, so the page renders with default focus both before and after 107.
4. **Deselecting a photo then saving** must not leave its stale focus key growing forever. → Task 4 prunes `photo_focus` to current `photo_paths` keys on save; verify via code review.
5. **The two pages drifting on the sentence** again. → Task 2's keep-in-step vitest asserts both page sources reference the constant and contain no hard-coded "donates around 50"/"donate around 50" literal.

---

### Task 1: Migration 107, verify_107, types

**Files:**
- Create: `supabase/migrations/107_wall_of_honor_photo_focus.sql`, `supabase/verify/verify_107.sql`
- Modify: `src/types/database.ts` (entries Row/Insert/Update + `wall_of_honor_public` Views Row gain `photo_focus`)

**Interfaces:**
- Produces: `wall_of_honor_entries.photo_focus jsonb NOT NULL default '{}'`; validity function `public.woh_photo_focus_valid(jsonb) returns boolean` (immutable, revoked by name) used by the CHECK: every value an object whose `x` and `y` are numbers in 0..100, no other value types; the view with `photo_focus` APPENDED as the last column; the guard additionally reverting `photo_focus` for non-admin authenticated sessions. Types: `photo_focus: Json` (the repo's Json type) on both shapes.

- [ ] **Step 1:** `npm run verify:local -- --dump-schema`; header enumerates the view's current column list (106 did not change it; 105's ten columns) and the guard in force (105's), per the replacing-a-view rule.
- [ ] **Step 2: Write the migration** (one begin/commit): the column + comment; the validity function + CHECK (`woh_photo_focus_valid(photo_focus)`), revoke EXECUTE by name; `create or replace function public.wall_of_honor_guard()` = 105's body EXACTLY plus `new.photo_focus := old.photo_focus;` in the non-admin revert list (re-state 105's revoke line); `create or replace view public.wall_of_honor_public` = the ten current columns in order + `w.photo_focus` appended; re-grant select to anon, authenticated; comments updated.
- [ ] **Step 3: verify_107** (ZZ inactive-event fixtures, 104-106 harness conventions, cleanup): A) view has EXACTLY eleven columns in order ending `photo_focus`, grants intact, anon still denied on the table, both new function/constraint exist, no column nullability changed; B) negative controls each catching check_violation: `{"p": {"x": 150, "y": 10}}`, `{"p": {"x": "a", "y": 10}}`, `{"p": 5}`, `{"p": {"x": 1}}`; positive: `'{}'` and `{"a/photo-0.jpg": {"x": 40, "y": 20}}` accepted; an UPDATE of photo_focus on a PUBLISHED fixture succeeds (no publish CHECK interference); the 105 B5c owner-bypass pattern proves the guard reverts photo_focus for a non-admin identity while an admin identity's change lands; C) anon reads the published fixture's `photo_focus` through the view.
- [ ] **Step 4:** `npm run verify:local -- supabase/verify/verify_107.sql` PASS; `--audit` PASS; `npm test` PASS; `npx tsc --noEmit` clean. **Step 5: Commit.**

---

### Task 2: One home for the Gold Star passes sentence

**Files:**
- Modify: `src/lib/event-config.ts`, `src/app/info/wall-of-honor/page.tsx` (:102-116 box), `src/app/events/vip-meet-greet/page.tsx` (:122-126)
- Create: `src/lib/gold-star-sentence.test.ts` (the keep-in-step test)

**Interfaces:**
- Produces: `export const GOLD_STAR_PASSES_SENTENCE = 'American Tattoo Society and the Cumberland County Crown Complex donate around 50 VIP passes each year for Gold Star family members.'` with the superseding comment (Ryan 2026-10-23: the Crown is now a co-donor, superseding the 2026-09-13 correction; keep "around 50" - varies with Survivor Outreach Services sign-ups).

- [ ] **Step 1 (TDD): the keep-in-step test first** - reads both page source files (anon-reads.test.ts's readFileSync idiom): each must contain `GOLD_STAR_PASSES_SENTENCE`, neither may match `/donates? around 50/`; plus the constant itself contains "and the Cumberland County Crown Complex" and ends "family members." Run → FAIL (constant missing, literals present).
- [ ] **Step 2:** Add the constant; replace both hard-coded sentences with `{GOLD_STAR_PASSES_SENTENCE}` (the vip page keeps its following sign-up sentences as-is in the same paragraph; the wall page keeps its sign-up paragraph). REWRITE the wall page's :103-109 comment: the two pages now share the constant (point at it), and record the supersession so nobody reverts - the 2026-09-13 note said the Crown was not a co-donor; as of Ryan 2026-10-23 it is. Remove any stale parallel comment on the vip page.
- [ ] **Step 3:** Test → PASS; `npm test` PASS; `npm run build` PASS. **Step 4: Commit.**

---

### Task 3: Public page - tribute clamp and focus-aware images

**Files:**
- Create: `src/app/info/wall-of-honor/TributeText.tsx` (client)
- Modify: `src/app/info/wall-of-honor/page.tsx` (card uses TributeText; builds the focus array), `src/app/info/wall-of-honor/HonoreePhotos.tsx` (focus prop → object-position)

**Interfaces:**
- Consumes: Task 1's `photo_focus` through the view (select gains the column).
- Produces: `TributeText({ text }: { text: string })` - renders the tribute with `whitespace-pre-line`, clamped to 8 lines (`WebkitLineClamp` style or `line-clamp-[8]`) when collapsed; measures overflow (`scrollHeight > clientHeight`) on mount AND on window resize; the toggle `<button aria-expanded={expanded}>` labeled "Read more"/"Show less" renders only while overflow exists (or while expanded); expansion in place. `HonoreePhotos` gains `focus?: ({ x: number; y: number } | null)[]` parallel to `urls`; card and thumbnail `<Image>` get `style={{ objectPosition: f ? \`${f.x}% ${f.y}%\` : '50% 25%' }}`; the lightbox `<img>` untouched.

- [ ] **Step 1:** TributeText per the interface (client component; a layout-effect measurement; re-measure on resize via a listener with cleanup).
- [ ] **Step 2:** Page: switch the view read to `select('*')` with a comment saying why (the live wall must keep rendering while 107 is delivered but not yet applied; an explicit list naming `photo_focus` would 42703 the read and blank a wall that now has published tributes); build `focus` by mapping each `photo_paths` entry through a defensive reader (missing column or key → null; object with numeric x/y clamped 0-100 → value; anything else → null); pass to HonoreePhotos; swap the card's tribute `<p>` for `<TributeText text={h.tribute.trim()} />`.
- [ ] **Step 3:** HonoreePhotos: apply objectPosition per the interface on the main card Image and each thumbnail Image, default `'50% 25%'`.
- [ ] **Step 4:** `npx tsc --noEmit` clean; `npm test` PASS; `npm run build` PASS. **Step 5: Commit.**

---

### Task 4: Admin focus editor

**Files:**
- Modify: `src/app/admin/wall-of-honor/page.tsx`

**Interfaces:**
- Consumes: Task 1's column + types; `requestRevalidate` (already imported); the drawer's existing WallPhotos section (selected wall photos with signed URLs).
- Produces: `EntryPatch` gains `photo_focus` (nothing else).

- [ ] **Step 1:** In the drawer, each SELECTED wall photo gets "Set focus": clicking the photo records the click position as x/y percent (bounding-rect math on the displayed image); a live preview box at the public card's aspect (5/3, i.e. the 2-col grid's ~480x288) shows the photo with the same object-position the public card will use (default 50% 25% when unset); a small "Reset" clears the photo's focus back to default. Save: prune `photo_focus` to keys in current `photo_paths`, write via `saveEntry` ({ photo_focus }), replace the row from the response, then `requestRevalidate({ paths: ['/info/wall-of-honor'], tags: ['wall-of-honor'] })` with the switch's existing may-take-a-minute fallback toast. Enabled regardless of `is_published` (the picker's unpublish-first lock does NOT apply to focus - say so in a short comment: files don't change).
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm test` PASS; `npm run build` PASS. **Step 3: Commit.**

---

### Task 5: Session note and full verification

**Files:**
- Create: `docs/handoff/sessions/2026-10-24-wall-of-honor-polish.md` (the branch's ONLY handoff edit)

- [ ] **Step 1:** Session note: what PR 4 adds; **107 delivered NOT applied, after 106**; deploy-before-apply is SAFE FOR THE LIVE WALL (the page reads `select('*')` and defaults the focus, so tributes keep rendering at upper-center until 107 is applied; the admin focus editor is what needs 107); the donor-sentence supersession (Ryan 2026-10-23 over 2026-09-13) and its one home; focus defaults (50% 25%) and that focus edits work while published; the clamp behavior.
- [ ] **Step 2:** Full verification, outcomes verbatim: `npm test`, `npm run build`, `npm run verify:local -- supabase/verify/verify_107.sql`, `npm run verify:local -- --audit`. All PASS. **Step 3: Commit.** (Push + PR after the final whole-branch review.)
