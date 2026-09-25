# Pinup Capacity (one home) and Public Grant Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pinup contest cap lives in one server-side place (`events.pinup_capacity`), the registration RPC can no longer be reached by anon or told a capacity, direct anon inserts into the two intake tables are closed, anon can no longer read applicant PII through the directory policy, and the admin can edit the cap.

**Architecture:** Migration 074 adds `events.pinup_capacity`, recreates `register_pinup_entry` and `pinup_spots_remaining` without the capacity parameter (read from the event row), fixes the register grant to service_role only, drops the anon INSERT policies on `pinup_entries` and `panel_registrations` (both routes write with the service role), and replaces anon's table-level SELECT on `applications` with a column-level grant limited to what the three directory pages select. The route, the admin pinup page, the public page copy and the waitlist email all take the number from the column. `/admin/events` edits it. verify_074 carries the broader audit as assertions: every public table has RLS, anon and authenticated execute exactly their allow-lists, and the anon-reachable write policies are the known set.

**Tech Stack:** Next.js 16, Supabase RLS + plpgsql, vitest, guardedWrite.

**Spec:** Ryan's messages of 2026-09-24 (follow-up on register_pinup_entry; go-ahead with additions 1-3; pending rows keep counting toward capacity).

## Global Constraints

- No em/en dashes in `src/`; `CONTACT_EMAIL` for any contact address.
- Branch `feat/pinup-capacity` from develop; PR into develop.
- Migration **074**, `verify_074.sql` delivered, never applied. Policies enumerated in the header before change.
- One home per fact: capacity = `events.pinup_capacity`. No literal 25 next to pinup wording in `src/` (test).
- Pending rows keep counting toward capacity (Ryan's decision).
- `src/types/database.ts` hand-maintained: add `pinup_capacity` to events; update the two function signatures.
- `guardedWrite()` on browser writes.

## Review Focus

1. **Capacity lowered below current confirmed entries.** Nothing is removed; spots remaining clamps at 0; the admin sees the note. Test `spotsRemaining` with taken > capacity → 0.
2. **A non-positive or non-integer capacity typed in the admin.** Refused client-side and by the check constraint. Test `parseCapacity`.
3. **Anon `select=*` on applications** after the column grant: refused at the column level, and no anon caller in the app uses `*` (source-reading test asserts the three directory selects name no revoked column).
4. **The waitlist email and the public copy** must say the live number, not 25. Test the copy helper; the route passes the RPC's returned capacity.
5. **Dropping the anon insert policies** must not break the routes: both use the service role (read 2026-09-24). verify_074 block C tries an anon insert and expects refusal.

---

## Audit findings (2026-09-24, migrations + anon probes against production; verify_074 prints the live catalog)

**Functions, anon (probed live after 073):** executable = is_admin, has_paid_deposit, booth_publicly_visible, sponsor_tier_counts, voting_state, pinup_spots_remaining, tattoo_battle_media_ok, **register_pinup_entry (wrong; 051/052/055 granted service_role only; verify_073's allow-list was wrong to include it)**. Refused: has_role, owns_invoice, comp/uncomp, expire/cancel, set_tattoo_battle_champion.
**Functions, authenticated (from migrations; not probeable without a JWT):** the anon set plus has_role, owns_invoice, comp_application, uncomp_application, set_tattoo_battle_champion (all admin-checked inside), and register_pinup_entry via default privileges (fixed in 074). expire/cancel revoked by 073.
**Tables:** all 25 have an RLS enable statement in migrations; verify_074 asserts `rowsecurity` live for every table in `public`. Anon SELECT is revoked at the grant level on 9 tables (038 set: exclusivity_grants, exhibitors, food_trucks, panels, placement_check_runs, presentation_credit_items, presentation_credits, schedule_items, sponsorships). Anon reads rows on: applications (**2 rows, ALL columns incl. email, contact_name, notes, total_amount, id_doc_url, user_id, comped_by**, via "public read deposit-paid", satisfied now by the comp milestones), events, contests, page_content, page_galleries, page_images, team_members, venues (all public by design).
**Anon-reachable writes (policy has `to anon` or no TO clause):** pinup_entries insert (dropped in 074); panel_registrations insert `with check (true)` (dropped in 074; the route uses the service role); sponsorships insert "Anyone can submit sponsor application" (by design: /apply/sponsor inserts from the browser, clamped by 049); applications own insert / profiles own update / food_trucks vendor update (all require auth.uid(), dead for anon); the admin `all` policies scoped to PUBLIC with is_admin() (dead for anon; hygiene only).
**Folded into 074:** register grant, pinup and panel anon insert policies, applications anon column grant, capacity home.
**For 075 (not small):** applications public reads through a column-limited view (038 pattern) so authenticated non-owners also stop seeing PII; the PUBLIC-scoped admin policies rewritten `to authenticated`.

## Decisions recorded

- **D1.** Capacity column on `events` (one active event; the pinup is not a `contests` row and `contests` has no capacity column).
- **D2.** `register_pinup_entry` returns `capacity int` as a fourth column so the route's waitlist email quotes the live number without a second read.
- **D3.** `pinup_spots_remaining(uuid)` stays anon-callable (the one integer anon may learn) and reads the column.
- **D4.** Anon column grant on `applications` = exactly the union of the three directory selects plus the columns the policy expression needs (`id, event_id, status, needs_roster, directory_override`). `phone` and `artists` are included because the directory already shows them; that is existing behaviour, not new exposure.
- **D5.** The admin page is `/admin/events` ("Event settings"): active event read-only, pinup capacity editable, sidebar entry. Admin-only by `roles.ts` (`admin: '*'`).
- **D6.** Public page: `page.tsx` reads the capacity server-side (cookieless anon client, `unstable_cache` 60 s, tag `pinup`) and passes it to the client; `/events/pinup-contest` joins the purge allow-list and the admin page purges it on save.

### Task 1: Pure helpers (tests first)
`src/lib/pinup-capacity.ts`: `parseCapacity(input: string): { ok: true; value: number } | { ok: false; error: string }`; `spotsRemaining(capacity, taken)`; `capacityCopy(capacity)` → `{ intro: string; waitlist: string; email: string }` (the three sentences); `LOWER_CAPACITY_NOTE`. Test file also source-reads `src/` for `/\b25\b[^\n]{0,40}(place|contestant|spot)/i` outside this helper → must be empty, and asserts the three directory selects contain none of `email|notes|id_doc_url|veteran_id_url|user_id|total_amount|comped|approved_at|deposit_due_at|final_due_at|veteran_doc`.

### Task 2: Migration 074 + verify_074 + types (+ verify_073 allow-list fix)
### Task 3: Route + admin pinup page + public page + copy
### Task 4: `/admin/events` page + sidebar + purge allow-list
### Task 5: HANDOFF (audit report, 074, 075 list, rate-limiting item)
### Task 6: Whole-branch verification, security review, PR
