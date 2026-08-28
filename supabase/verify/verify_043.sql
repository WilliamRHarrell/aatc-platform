-- ============================================================
-- ⚠  RUN ONE LETTERED BLOCK AT A TIME - DO NOT RUN THIS FILE WHOLE.
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
-- `X2 of 2`. Run those separately too - the same last-statement-wins rule
-- applies inside a block.
-- ============================================================

-- ============================================================
-- VERIFY 043 - run after the migration. Read the results; nothing mutates.
--
-- WHAT THIS FILE IS FOR. 043 did two unrelated things:
--   (i)  exempted service_role from the two applications clamp triggers, and
--   (ii) restored four owner read/write policies that permissive baselines had
--        been silently carrying.
--
-- (ii) IS ALREADY MEASURED. The four policies were confirmed present by
-- catalog query on 2026-08-13. They are re-checked in D below only so this file
-- is a complete record, not because they are in doubt.
--
-- (i) IS NOT MEASURED, AND IT IS THE POINT OF THIS FILE. The exemption was
-- inferred from a single behavioural probe - a service-role insert retained
-- deposit_due_at - and from the migration text. Nobody has read the DEPLOYED
-- function bodies to confirm the `auth.uid() is null` branch is actually in
-- them. A probe proves the symptom is gone; it does not prove which change
-- removed it, and `create or replace function` fails silently in exactly one
-- way that matters here: if 043 was pasted partially (the truncation that hit
-- 034 three times), the first function could carry the exemption and the second
-- not, and no error would be raised. A and B are that check.
--
-- Query A: both clamp functions carry the service-role exemption.  ← CENTREPIECE
-- Query B: both still clamp - the exemption did not widen into a bypass.
-- Query C: both are still SECURITY DEFINER with a pinned search_path.
-- Query D: both triggers are installed and ENABLED.
-- Query E: the four owner policies exist (already measured; recorded here).
--
-- WHAT NONE OF THIS PROVES: that an owner can actually read their own row. See
-- the note at the bottom - that is behaviour, and it is still unverified.
-- ============================================================


-- ── A. THE CENTREPIECE ──────────────────────────────────────
-- Both functions must contain `auth.uid() is null` in their exemption line.
-- want: 2 rows, has_exemption = true on BOTH.
--
-- If applications_force_safe_insert is true and applications_protect_staff_columns
-- is false, 043 was applied partially - the INSERT path is fixed and the UPDATE
-- path is not. That is the failure mode this query exists to catch, and it is
-- invisible to the insert probe that was already run.
select p.proname                                              as function_name,
       regexp_replace(p.prosrc, '\s+', ' ', 'g')
         like '%auth.uid() is null%'                          as has_exemption,
       'want true for both'                                   as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('applications_force_safe_insert',
                     'applications_protect_staff_columns')
 order by 1;


-- ── B. The exemption did not become a bypass ────────────────
-- The clamp is what stops an applicant self-approving. Confirm each function
-- still contains its clamping assignments - i.e. that the guard was ADDED to
-- the existing logic rather than replacing it.
-- want: 2 rows, still_clamps = true on both.
select p.proname                                              as function_name,
       case p.proname
         when 'applications_force_safe_insert' then
           regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.status := ''pending''%'
       when 'applications_protect_staff_columns' then
           regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.status := old.status%'
       end                                                    as still_clamps,
       'want true for both'                                   as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('applications_force_safe_insert',
                     'applications_protect_staff_columns')
 order by 1;


-- ── C. Still SECURITY DEFINER, still pinned ─────────────────
-- 043 restated both function headers. A `create or replace` that omitted
-- `security definer` or the `set search_path` would silently drop them - and an
-- unpinned search_path on a SECURITY DEFINER function gating admin access is
-- the exact defect migration 027 existed to fix.
-- want: is_definer = true and search_path_pinned = true on both.
select p.proname                                              as function_name,
       p.prosecdef                                            as is_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(none)')  as config,
       coalesce(array_to_string(p.proconfig, ', '), '')
         like '%search_path%'                                 as search_path_pinned,
       'want true / true'                                     as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('applications_force_safe_insert',
                     'applications_protect_staff_columns')
 order by 1;


-- ── D. Triggers installed and enabled ───────────────────────
-- `create or replace function` does not touch triggers, so these should be
-- untouched by 043 - but a disabled trigger presents exactly like a fixed one,
-- and would ALSO make the insert probe pass. tgenabled: 'O' = enabled (origin),
-- 'D' = DISABLED, 'A' = always, 'R' = replica.
-- want: 2 rows, both tgenabled = 'O'.
select t.tgname                                               as trigger_name,
       t.tgenabled                                            as enabled_flag,
       t.tgenabled = 'O'                                      as is_enabled,
       'want O / true for both'                               as expected
  from pg_trigger t
 where t.tgrelid = 'public.applications'::regclass
   and not t.tgisinternal
   and t.tgname in ('applications_force_safe_insert_trg',
                    'applications_protect_staff_columns_trg')
 order by 1;


-- ── E. The four owner policies (already measured 2026-08-13) ─
-- Recorded for completeness. want: 4 rows.
--   food_trucks : own read - regression from 038
--   exhibitors  : own insert - pre-existing, never existed
--   exhibitors  : own read - pre-existing, never existed
--   booths      : own read - regression from 042
select tablename, policyname, cmd, roles::text,
       coalesce(qual, with_check) as expression
  from pg_policies
 where schemaname = 'public'
   and policyname in ('food_trucks: own read',
                      'exhibitors: own insert',
                      'exhibitors: own read',
                      'booths: own read')
 order by tablename, policyname;


-- ============================================================
-- STILL UNVERIFIED AFTER THIS FILE - POLICY BEHAVIOUR.
--
-- E proves the four policies EXIST. It does not prove any of them WORKS.
-- No owner has ever read their own row through them, because the tables are
-- empty or unassigned after the teardown: food_trucks has no rows, exhibitors
-- has no rows, and no booth has an application_id. A policy that exists but
-- whose USING clause is subtly wrong reads identically to a correct one in
-- pg_policies and returns zero rows to the owner at runtime.
--
-- That is the same class of evidence - reasoned from catalog state, not
-- measured against behaviour - that let all four of these break unnoticed in
-- the first place. Re-test these three surfaces once real rows exist:
--   1. /portal food-truck panel - vendor reads their own truck
--   2. RosterCompletionPanel - creates an exhibitor row
--   3. /portal booth display - APPROVED BUT UNPAID exhibitor sees
--                                            their own booth assignment
--
-- (3) is the one to be deliberate about: an exhibitor who HAS paid is covered
-- by the deposit-gated public policy as well, so testing with a paid exhibitor
-- passes whether "booths: own read" works or not. Test with an unpaid one.
-- ============================================================
