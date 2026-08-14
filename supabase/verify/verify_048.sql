-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME — DO NOT RUN THIS FILE WHOLE.
--
-- The Supabase SQL Editor displays only the LAST statement's result. Running
-- the whole file returns the final query and silently discards every check
-- above it, which looks exactly like a file that only ever had one check in
-- it. Nothing errors; the other results simply never appear.
--
-- Select from a block's `-- ── X.` header down to its semicolon, run that,
-- read the result, then move to the next. The expected result is stated in
-- each block, usually as a `want:` comment or an `expected` column.
--
-- A few blocks are marked `(2 queries)` and contain a second statement labelled
-- `X2 of 2`. Run those separately too — the same last-statement-wins rule
-- applies inside a block.
-- ============================================================

-- ============================================================
-- VERIFY 048 — run after the migration. Nothing mutates.
--
-- Query A: the audit table and its indexes exist.
-- Query B: the trigger is installed, ENABLED, and fires AFTER.  ← order matters
-- Query C: the storage owner policies exist.
-- Query D: nothing but admins can read the audit trail.
-- Query E: what the write path relies on, restated.
-- ============================================================


-- ── A. Audit table ──────────────────────────────────────────
-- want: the columns below, and by_owner NOT NULL.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profile_edits'
 order by ordinal_position;


-- ── B. Trigger installed, enabled, and AFTER ──────── (2 queries) ─
-- want: 1 row, tgenabled = 'O', timing = 'AFTER'.
--
-- AFTER is not cosmetic. applications already carries a BEFORE UPDATE clamp
-- (041, amended by 043) that REWRITES NEW for any non-admin. A BEFORE audit
-- trigger could fire before that clamp and record what the caller SUBMITTED
-- rather than what was stored — an audit trail showing changes that never
-- happened, which is worse than none.
select t.tgname,
       t.tgenabled,
       t.tgenabled = 'O' as is_enabled,
       case when (t.tgtype::int & 2) = 0 then 'AFTER' else 'BEFORE' end as timing,
       'want O / true / AFTER' as expected
  from pg_trigger t
 where t.tgrelid = 'public.applications'::regclass
   and not t.tgisinternal
   and t.tgname = 'applications_log_profile_edit_trg';

-- B2 of 2 — run separately. Both triggers on applications, for ordering. PostgreSQL fires same-timing
-- triggers alphabetically; these are different timings, so BEFORE always wins.
select tgname,
       case when (tgtype::int & 2) = 0 then 'AFTER' else 'BEFORE' end as timing
  from pg_trigger
 where tgrelid = 'public.applications'::regclass
   and not tgisinternal
 order by timing desc, tgname;


-- ── C. Storage owner policies ───────────────────────────────
-- want: 3 rows — own profile insert / update / delete on exhibitor-media.
-- Before 048 this bucket was admin-insert-only, which is why an exhibitor could
-- not upload a logo AND why the existing sponsor logo upload in /portal was
-- also failing for any non-admin.
select policyname, cmd, roles::text
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'exhibitor-media%'
 order by policyname;


-- ── D. The audit trail is admin-read-only ───────────────────
-- want: exactly one policy, SELECT, using is_admin(). No INSERT policy — the
-- trigger is SECURITY DEFINER and is the only writer, so nothing can forge or
-- edit history through the API.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'profile_edits';


-- ── E. The write path — restated, not changed ────── (2 queries) ─
-- 048 adds NO table policy for the self-edit itself, because 041 already
-- granted owners UPDATE on their own application and its clamp does not cover
-- the directory-facing fields. Confirm that is still true: want the owner
-- UPDATE policy present, and NONE of these six columns named in the clamp.
select policyname, cmd, qual as using_expr, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'applications'
   and policyname = 'applications: own update';

-- E2 of 2 — run separately.
-- want: all six false. A true means that field is clamped and the portal will
-- silently fail to change it — the write returns success and the value reverts.
select
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.business_name := old.business_name%' as clamps_business_name,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.website := old.website%'             as clamps_website,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.instagram := old.instagram%'         as clamps_instagram,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.facebook := old.facebook%'           as clamps_facebook,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.phone := old.phone%'                 as clamps_phone,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.logo_url := old.logo_url%'           as clamps_logo_url,
  'want false for all six' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'applications_protect_staff_columns';


-- ============================================================
-- STILL UNVERIFIED AFTER THIS FILE — the behaviour, as always.
--
-- Everything above is catalog state. Nobody has saved a profile as a real
-- exhibitor. Test with a NON-ADMIN account against a real application:
--
--   1. change business_name        → directory listing updates, feed shows it
--   2. upload a logo               → lands under profiles/<user id>/, renders
--   3. attempt to change status    → succeeds with the value UNCHANGED (the
--                                    BEFORE clamp rewrites silently — check the
--                                    resulting VALUE, not the absence of error)
--   4. read /admin as that account → refused
--
-- (2) is the one most likely to fail quietly: a storage denial surfaces as a
-- toast, but if the path prefix is wrong the policy rejects it and the cause is
-- not obvious from the message. The path must start `profiles/<auth.uid()>/`.
-- ============================================================
