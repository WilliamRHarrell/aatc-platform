-- ============================================================
-- Migration 079b: applications.user_id is nullable (015, never applied live)
-- Verification: supabase/verify/verify_079b.sql, then re-run verify_079.sql
--
-- WHY. 015_nullable_user_id.sql ("allow admin-created applications
-- (in-person signups) without a user account") was never applied in
-- production: verify_079 block E failed on 2026-09-26 with 23502, and the
-- live check read is_nullable = NO. Same shape as 047 - a file in the repo
-- that reads as history and was never state. 079 is already applied, so this
-- is a new migration, not an edit.
--
-- WHAT DEPENDED ON IT. The /admin/booths add form (PR #17) inserts user_id
-- NULL so the one-active-application index (079, partial on user_id is not
-- null) counts applicants only. Before this, the form wrote the ADMIN's own
-- user_id, so after 079 a second hand-added booth in the same event - or the
-- second booth of one multi-booth add - is refused with 23505.
--
-- POLICIES: none changed. Enumerated from the migrations (verify_079b lists
-- the LIVE set and asserts on it, because a file is not the database):
--   applications  "own read"   (001) using auth.uid() = user_id
--                 "own insert" (075) with check auth.uid() = user_id
--                 "own update" (041) owner-scoped on user_id
--                 "admin all" (075), "staff read directory rows" (075)
--   exhibitors / booths owner reads (043) a.user_id = auth.uid()
--   invoices "own read" via owns_invoice() (029) a.user_id = p_user_id
-- Every owner test is an EQUALITY with auth.uid(). NULL = anything is NULL,
-- which a policy treats as false, so a NULL-owner row is visible to admins,
-- staff and the service role only. No policy tests user_id IS NULL.
-- An authenticated applicant still cannot insert NULL ("own insert").
--
-- NOT DONE HERE: existing rows that carry an admin's user_id from the old
-- form are LISTED by verify_079b (block D) for review, not rewritten.
-- ============================================================
begin;

alter table public.applications alter column user_id drop not null;

comment on column public.applications.user_id is
  'Applicant account. NULL for an admin-added (in-person) application; no self-service link exists yet. 015 intended this; 079b applied it.';

commit;
