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
-- VERIFY 049 — run after the migration. Nothing mutates.
--
-- Query A: every policy on sponsorships, for the record.     ← the standing rule
-- Query B: the owner UPDATE policy is scoped both ways.
-- Query C: THE ALLOW-LIST — the clamp keeps only seven fields. ← CENTREPIECE
-- Query D: the insert clamp closes the self-link hole.
-- Query E: both triggers installed, enabled, and ordered correctly.
-- Query F: nothing is already self-linked.                   ← check before trusting
-- ============================================================


-- ── A. Every policy on sponsorships ─────────────────────────
-- This table has hidden an owner path twice (030, 038). Print the whole set
-- rather than checking only what 049 added.
-- want: admin write (ALL), Sponsors can read own (SELECT), Anyone can submit
-- (INSERT), sponsorships: own update (UPDATE). Nothing with qual = true.
select policyname, cmd, permissive, roles::text,
       qual as using_expr, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'sponsorships'
 order by cmd, policyname;


-- ── B. Owner UPDATE, scoped on both sides ───────────────────
-- want: 1 row, BOTH qual and with_check present and equal to user_id = auth.uid().
-- A null with_check would let a linked sponsor reassign user_id to someone else
-- on the way out. (The clamp also restores user_id, so this is belt and braces
-- — but the policy should not depend on the trigger.)
select policyname, qual as using_expr, with_check as with_check_expr,
       'want both non-null' as expected
  from pg_policies
 where schemaname = 'public' and tablename = 'sponsorships'
   and policyname = 'sponsorships: own update';


-- ── C. CENTREPIECE — the clamp is an ALLOW-LIST ──── (2 queries) ─
-- 049 inverts 041 deliberately: NEW is rebuilt from OLD and only the listed
-- keys are taken from the submitted row, so a column added to sponsorships
-- later is protected by DEFAULT rather than editable by default.
--
-- want: is_allow_list = true, and exactly the seven fields below.
-- If someone has "fixed" this into a deny-list, is_allow_list goes false and
-- every future column silently becomes sponsor-editable.
select p.proname,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%jsonb_populate_record%'
         as is_allow_list,
       regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%auth.uid() is null%'
         as exempts_service_role,
       p.prosecdef as is_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(none)') as config,
       'want true / true / true' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'sponsorships_protect_commercial_columns';

-- C2 of 2 — run separately.
-- The allowed set, spelled out. want: all seven true, and all nine false.
select
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''contact_name''%' as allows_contact_name,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''email''%'        as allows_email,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''phone''%'        as allows_phone,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''website''%'      as allows_website,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''instagram''%'    as allows_instagram,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''facebook''%'     as allows_facebook,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''logo_url''%'     as allows_logo_url,
  -- None of these may appear in the allow-list.
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''tier''%'             as LEAK_tier,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''amount''%'           as LEAK_amount,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''status''%'           as LEAK_status,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''show_on_homepage''%' as LEAK_show_on_homepage,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''featured_footer''%'  as LEAK_featured_footer,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''homepage_order''%'   as LEAK_homepage_order,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''is_in_kind''%'       as LEAK_is_in_kind,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''amount_locked''%'    as LEAK_amount_locked,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%''hold_expires_at''%'  as LEAK_hold_expires_at,
  'want seven true, nine false' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'sponsorships_protect_commercial_columns';


-- ── D. The insert clamp ─────────────────────────────────────
-- "Anyone can submit sponsor application" is with check (status = 'pending'),
-- which constrains ONE column. Without this trigger a public submission can set
-- user_id — SELF-LINKING itself past the admin linking step and granting itself
-- the owner UPDATE that 049 just created — and amount_locked, the flag designed
-- to resist price correction.
-- want: all true.
select
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.user_id := null%'           as clamps_user_id,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.status := ''pending''%'     as forces_pending,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.amount_locked := false%'    as clamps_amount_locked,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%new.show_on_homepage := false%' as clamps_placement,
  regexp_replace(p.prosrc, '\s+', ' ', 'g') like '%auth.uid() is null%'            as exempts_service_role,
  'want true for all' as expected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'sponsorships_force_safe_insert';


-- ── E. Triggers installed, enabled, and ORDERED ─────────────
-- want: 3 rows, all tgenabled = 'O'.
-- Ordering matters for the two BEFORE UPDATE triggers: PostgreSQL fires
-- same-timing triggers ALPHABETICALLY, so sponsorships_protect_commercial_
-- columns_trg must sort before sponsorships_updated_at. 'p' < 'u', so it does —
-- the clamp rebuilds the row first and updated_at is stamped afterwards. If the
-- clamp ran second it would restore the OLD updated_at and the column would
-- freeze.
select tgname,
       tgenabled,
       tgenabled = 'O' as is_enabled,
       case when (tgtype::int & 2) = 0 then 'AFTER' else 'BEFORE' end as timing,
       case when (tgtype::int & 4) <> 0 then 'INSERT'
            when (tgtype::int & 16) <> 0 then 'UPDATE' end as event
  from pg_trigger
 where tgrelid = 'public.sponsorships'::regclass
   and not tgisinternal
 order by timing, tgname;


-- ── F. Nothing is already self-linked ───────────── (2 queries) ─
-- The insert hole was open until now, so check whether any existing row has a
-- user_id nobody set on purpose. Every link here should be one an admin made.
-- Cross-reference against who you have actually linked.
-- want: only rows you recognise.
select s.id, s.sponsor_name, s.status, s.tier, s.amount, s.amount_locked,
       s.user_id, u.email as linked_account, s.created_at
  from sponsorships s
  left join auth.users u on u.id = s.user_id
 where s.user_id is not null
 order by s.created_at desc;

-- F2 of 2 — run separately.
-- Also worth a look: any row that arrived with a placement flag or a lock
-- already set. want: 0 rows other than ones staff set deliberately.
select id, sponsor_name, status, amount, amount_locked, is_in_kind,
       show_on_homepage, featured_footer, homepage_order
  from sponsorships
 where amount_locked or is_in_kind or show_on_homepage or featured_footer
    or homepage_order is not null
 order by created_at desc;


-- ============================================================
-- STILL UNVERIFIED — the behaviour.
--
-- Test with a real linked, NON-ADMIN sponsor account:
--   1. edit website / instagram / phone in /portal  → saves, visible on /sponsors
--   2. attempt to change tier or amount             → succeeds with the value
--      UNCHANGED. A BEFORE trigger rewrites silently, so check the resulting
--      VALUE, not the absence of an error.
--   3. submit the public sponsor form with user_id set → row lands unlinked
--
-- (2) is the one to be deliberate about: the portal UI does not offer those
-- fields, so testing through the UI proves nothing. Hit PostgREST directly with
-- that account's token.
-- ============================================================
