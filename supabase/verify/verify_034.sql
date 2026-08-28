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
-- VERIFY 034 - run separately, after the migration.
--
-- Returns one row per checked object with a pass/fail column. Read the results;
-- nothing here raises or mutates. Kept out of the migration because the SQL
-- editor truncated 034 mid-DO-block twice, leaving the block unterminated.
--
-- Expect 5 rows, all ok = true.
-- ============================================================

select
  'invoices.food_truck_id'      as object,
  confdeltype::text             as delete_rule,
  'c'                           as expected,
  (confdeltype = 'c'::"char")   as ok
  from pg_constraint
 where conrelid = 'public.invoices'::regclass
   and conname  = 'invoices_food_truck_id_fkey'

union all
select 'invoices.sponsorship_id', confdeltype::text, 'c', (confdeltype = 'c'::"char")
  from pg_constraint
 where conrelid = 'public.invoices'::regclass
   and conname  = 'invoices_sponsorship_id_fkey'

union all
select 'exhibitors.booth_id', confdeltype::text, 'c', (confdeltype = 'c'::"char")
  from pg_constraint
 where conrelid = 'public.exhibitors'::regclass
   and conname  = 'exhibitors_booth_id_fkey'

union all
select 'page_content.updated_by', confdeltype::text, 'n', (confdeltype = 'n'::"char")
  from pg_constraint
 where conrelid = 'public.page_content'::regclass
   and conname  = 'page_content_updated_by_fkey'

union all
select 'events_one_active_idx', coalesce(max(indexname), 'missing'), 'present',
       count(*) = 1
  from pg_indexes
 where schemaname = 'public' and indexname = 'events_one_active_idx';


-- ============================================================
-- RATIONALE (moved here from the migration header so 034 stays pasteable)
--
-- From an audit of all 21 foreign keys. Two of the four SET NULL relationships
-- were found by accident during teardowns, which is the wrong way to find them.
--
-- confdeltype: c = CASCADE, n = SET NULL, a = NO ACTION, r = RESTRICT
--
-- 1. invoices.food_truck_id   SET NULL  -> CASCADE
--    An invoice with no parent is meaningless. 033's exactly-one-parent check
--    turned the old SET NULL into a hard error on truck deletion - safer than
--    orphaning, still wrong. The invoice should go with the truck it bills.
--
-- 2. invoices.sponsorship_id  NO ACTION -> CASCADE
--    application_id on the same table was already CASCADE. The inconsistency
--    meant deleting a sponsorship errored instead of removing its invoice.
--
-- 3. exhibitors.booth_id      SET NULL  -> CASCADE
--    An exhibitor row is derived from an application and scoped to one event,
--    so it means nothing once its booth is gone - and SET NULL leaves a record
--    that looks complete while having lost which booth it occupied. RESTRICT
--    was the alternative but would block routine event teardown.
--
-- 4. page_content.updated_by  NO ACTION -> SET NULL
--    Deleting a departed admin should not be blocked by CMS rows they edited.
--    The audit value is the timestamp and the content, not the identity.
--
-- 5. events_one_active_idx
--    020's guard keyed on the NEW event name, so it could never recognise the
--    existing 'AATC Fayetteville 2027' row as the same show and inserted a
--    second one. Nothing prevented two active events. With this index, 020
--    would have failed loudly instead of silently stranding five panels, two
--    contests, two food trucks and a real sponsor on an orphaned event.
--
-- NOT CHANGED, deliberately:
--   booths.application_id -> applications  SET NULL
--     The FK is right; the bug was the sweep's non-atomicity (fixed in 035).
--   sponsorships.user_id  -> auth.users    NO ACTION
--     Blocking deletion of a user who still has a sponsorship is defensible.
--   food_trucks.user_id   -> auth.users    SET NULL
--     Correct: the truck outlives the account that registered it.
-- ============================================================
