-- ============================================================
-- VERIFY 041 — run after the migration. Read the results; nothing mutates.
--
-- 041 gave application owners an UPDATE path (roster completion needs it) and
-- added a BEFORE UPDATE trigger clamping every staff-controlled column, because
-- RLS is row-level and cannot restrict WHICH columns an update may set.
--
-- NOTE ON OVERLAP WITH 043: the clamp function verified in C below was later
-- rewritten by migration 043 to exempt service_role. If you are running this
-- file after 043, C will show the exemption present — that is correct and
-- expected. verify_043.sql checks the exemption specifically.
--
-- Query A: the owner UPDATE policy exists and is scoped to the caller.
-- Query B: NOTHING ELSE grants a wider UPDATE.                ← the real risk
-- Query C: the clamp function still clamps.
-- Query D: the trigger is installed and ENABLED.
-- Query E: needs_roster is enforced, not clamped.
-- ============================================================


-- ── A. The owner UPDATE policy ──────────────────────────────
-- want: 1 row. Both qual and with_check must be present and must both scope to
-- user_id = auth.uid(). A with_check of NULL on an UPDATE policy means a row
-- can be updated INTO a state that no longer matches the policy — here, an
-- owner reassigning user_id to someone else. (The trigger also clamps user_id,
-- so this is belt and braces, but the policy should not rely on that.)
select policyname, cmd, roles::text,
       qual        as using_expr,
       with_check  as with_check_expr,
       'want both non-null, both user_id = auth.uid()' as expected
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'applications'
   and policyname = 'applications: own update';


-- ── B. THE REAL RISK — every other UPDATE path on applications ─
-- Permissive policies OR together. A surviving `using (true)` UPDATE policy
-- would make the owner policy in A decorative AND would hand every
-- authenticated user an update path to every application. This is the defect
-- class that shipped three times; check it rather than assuming.
--
-- want: the admin policy, plus "applications: own update", and nothing else
-- whose using_expr is `true` or otherwise unscoped.
select policyname, cmd, permissive, roles::text,
       qual       as using_expr,
       with_check as with_check_expr
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'applications'
   and cmd in ('UPDATE','ALL')
 order by permissive, policyname;


-- ── C. The clamp function clamps ────────────────────────────
-- Spot-check the columns most worth money or status. want: all true.
select regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.status := old.status%'
         as clamps_status,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.total_amount := old.total_amount%'
         as clamps_total_amount,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.deposit_due_at := old.deposit_due_at%'
         as clamps_deposit_due_at,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.user_id := old.user_id%'
         as clamps_user_id,
       p.prosecdef as is_definer,
       'want true for all' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'applications_protect_staff_columns';


-- ── D. Trigger installed and enabled ────────────────────────
-- A disabled trigger presents exactly like an absent clamp.
-- want: 1 row, tgenabled = 'O'.
select t.tgname, t.tgenabled, t.tgenabled = 'O' as is_enabled,
       'want O / true' as expected
  from pg_trigger t
 where t.tgrelid = 'public.applications'::regclass
   and not t.tgisinternal
   and t.tgname = 'applications_protect_staff_columns_trg';


-- ── E. needs_roster is ENFORCED, not clamped ────────────────
-- Deliberately different from every other column: roster completion is an owner
-- action and is half the directory gate, so the owner MUST be able to flip it
-- false — but only when the roster is genuinely complete. Confirm both halves
-- of the rule survived: the completeness test, and the no-reopening rule.
-- want: both true, and clamps_needs_roster FALSE (clamping it would silently
-- break roster completion — the exact regression 041 was written to avoid).
select regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%roster_ok%'
         as has_completeness_test,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.needs_roster := old.needs_roster;  -- owners cannot re-open it%'
         or regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%elsif not old.needs_roster and new.needs_roster then%'
         as blocks_reopening,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.needs_roster := old.needs_roster; new.%'
         as clamps_needs_roster,
       'want true, true, false' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'applications_protect_staff_columns';


-- ============================================================
-- STILL UNVERIFIED AFTER THIS FILE.
--
-- Everything above is catalog state. The behavioural question — can an owner
-- actually complete their roster, and is an owner actually stopped from
-- self-approving — is not answered here and has never been measured against a
-- real application row. Both need a non-admin session against a real row:
--   1. owner sets needs_roster=false with a COMPLETE roster   → must succeed
--   2. owner sets needs_roster=false with an INCOMPLETE roster → must be refused
--   3. owner sets status='approved'                            → must stay unchanged
--
-- (3) will return success with the row unchanged, not an error — a BEFORE
-- trigger rewrites the row silently. Check the resulting VALUE, not the
-- absence of an error. This is the same shape as the `data:[] error:null`
-- problem: the write appears to work and did nothing.
-- ============================================================
