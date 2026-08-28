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
-- VERIFY 042 - run after the migration. Read the results; nothing mutates.
--
-- 042 added booth inventory flags (is_sellable / house_use), marked four booths
-- non-sellable per the 2024 floor plan, and rewrote the public booth policy to
-- check the booth's own flags rather than trusting assignment alone.
--
-- THE HOUSE-BOOTH DATA IS FROM THE 2024 PLAN AND IS NOT CONFIRMED FOR 2027.
-- Query C prints it for eyeballing against the current plan when the Crown
-- Complex provides it. Treat a passing C as "the migration did what it said",
-- not as "these are the right booths".
--
-- Query A: the columns exist with the right defaults.
-- Query B: the public policy checks is_sellable.
-- Query C: which booths are non-sellable, and why.            ← eyeball this
-- Query D: sellable inventory count, for reconciliation.
-- Query E: no non-sellable booth is currently assigned.       ← the live risk
-- ============================================================


-- ── A. Columns present ──────────────────────────────────────
-- want: 2 rows. is_sellable boolean NOT NULL default true; house_use text NULL.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'booths'
   and column_name in ('is_sellable','house_use')
 order by column_name;


-- ── B. The public policy checks the booth itself ────────────
-- The point of 042's policy rewrite: booth_publicly_visible() takes an
-- APPLICATION id, so it cannot see the booth's own flags. Without the
-- is_sellable term, one mis-assignment in /admin/booths publishes the Help Desk
-- as an exhibitor booth.
-- want: 1 row, checks_is_sellable = true.
select policyname, cmd, roles::text,
       qual as using_expr,
       qual like '%is_sellable%' as checks_is_sellable,
       'want true' as expected
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'booths'
   and policyname = 'booths: public read deposit-paid';


-- ── C. EYEBALL THIS - the non-sellable set ──────────────────
-- want: exactly 4 rows for the active event -
--   108 AATC Help Desk
--   241 Merch & Contest Registration
--   166 Does not exist on the floor plan
--   233 Does not exist on the floor plan
--
-- If a booth number is missing here, the UPDATE matched nothing - 042's updates
-- are unguarded `update ... where booth_number = '...'` with no row-count
-- assertion, so a booth_number stored as '108 ' or 'A108' would silently skip.
select b.booth_number, b.is_sellable, b.house_use
  from booths b
  join events e on e.id = b.event_id
 where e.is_active
   and not b.is_sellable
 order by b.booth_number;


-- ── D. Sellable inventory ───────────────────────────────────
-- want: total 267, non_sellable 4, sellable 263 - assuming the duplicate
-- 267-booth set removed in the teardown is in fact gone. A total of 534 means
-- it is not.
select count(*)                                as total_booths,
       count(*) filter (where not is_sellable) as non_sellable,
       count(*) filter (where is_sellable)     as sellable,
       'want 267 / 4 / 263' as expected
  from booths b
  join events e on e.id = b.event_id
 where e.is_active;


-- ── E. THE LIVE RISK - non-sellable booths must not be assigned ─
-- 042 added the flags but did not clear any assignment that already existed on
-- a booth it marked non-sellable. If /admin/booths assigned the Help Desk to an
-- exhibitor before 042 ran, that assignment is still there - now invisible to
-- the public policy (B correctly hides it) AND invisible to the exhibitor,
-- while still occupying the booth. Silent either way.
-- want: 0 rows.
select b.booth_number, b.house_use, b.application_id,
       a.business_name, a.status
  from booths b
  join events e on e.id = b.event_id
  left join applications a on a.id = b.application_id
 where e.is_active
   and not b.is_sellable
   and b.application_id is not null;


-- ── F. Index present ────────────────────────────────────────
-- want: 1 row, partial index on (event_id, is_sellable) where is_sellable.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename  = 'booths'
   and indexname  = 'booths_sellable_idx';


-- ============================================================
-- STILL UNVERIFIED AFTER THIS FILE.
--
-- 1. THE 2027 HOUSE-BOOTH SET. C reflects the 2024 plan. The current-year plan
--    from the Crown Complex has not been obtained, and the floor plan work
--    (HANDOFF §5) is blocked on the same document. Re-run C against it.
--
-- 2. THE OWNER READ PATH. 042 dropped 001's `booths: public read using (true)`,
--    which had been silently carrying owner reads - an approved-but-unpaid
--    exhibitor could no longer see their own booth. Migration 043 added
--    "booths: own read" to restore it. That policy EXISTS but has never been
--    exercised: no booth currently has an application_id (E returns 0 rows for
--    that reason too, which is why E passing today proves less than it looks).
--    Re-test with an approved, UNPAID exhibitor once one exists - a paid one is
--    covered by the deposit-gated policy and passes either way.
-- ============================================================
