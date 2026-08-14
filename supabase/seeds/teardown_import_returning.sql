-- ============================================================
-- TEARDOWN for an /api/admin/import-returning test.
--
-- ⚠  RUN ONE NUMBERED SECTION AT A TIME. The Supabase SQL Editor shows only the
-- LAST statement's result, so running this file whole would display the final
-- confirmation and hide the two "what will be deleted" queries — the ones you
-- are meant to read BEFORE anything is destroyed.
--
-- Replace the address on the next line and nothing else. Every statement is
-- scoped to it. Run the SELECTs first and read them — this deletes an auth
-- user, and there is no undo.
--
-- ORDER MATTERS. The application must go before the auth user: applications
-- .user_id references auth.users, and depending on the FK rule the delete will
-- either fail or null the column and strand the row.
-- ============================================================

-- ── 0. SET THIS ─────────────────────────────────────────────
-- Used by every statement below. If you are running these one at a time in the
-- SQL editor rather than as a block, paste the address into each instead.
\set test_email 'REPLACE-ME@example.com'


-- ── 1. LOOK FIRST — what will be deleted ────────────────────
-- Expect exactly one auth user, one application, one invoice. If you see more
-- than one application, the import was run more than once; the deletes below
-- still handle it, but confirm none of them is real before proceeding.
select u.id as auth_user_id, u.email, u.created_at,
       a.id as application_id, a.business_name, a.status,
       i.id as invoice_id, i.status as invoice_status, i.amount
  from auth.users u
  left join applications a on a.user_id = u.id
  left join invoices i     on i.application_id = a.id
 where lower(u.email) = lower(:'test_email');

-- Anything else attached? All should be 0 for a fresh import test. A non-zero
-- booth count means the test exhibitor was assigned a booth — release it in
-- /admin/booths before deleting, or the assignment is lost with no history.
select
  (select count(*) from booths b
     join applications a on a.id = b.application_id
    where a.user_id = (select id from auth.users where lower(email) = lower(:'test_email'))
  ) as booths_assigned,
  (select count(*) from exhibitors e
     join applications a on a.id = e.application_id
    where a.user_id = (select id from auth.users where lower(email) = lower(:'test_email'))
  ) as exhibitor_rows;


-- ── 2. DELETE — child rows first ────────────────────────────
begin;

-- Release any booth before the application goes. booths.application_id is
-- ON DELETE SET NULL, so this would happen anyway — doing it explicitly means
-- the booth is verifiably free rather than incidentally freed.
update booths
   set application_id = null
 where application_id in (
   select a.id from applications a
     join auth.users u on u.id = a.user_id
    where lower(u.email) = lower(:'test_email'));

delete from invoices
 where application_id in (
   select a.id from applications a
     join auth.users u on u.id = a.user_id
    where lower(u.email) = lower(:'test_email'));

delete from exhibitors
 where application_id in (
   select a.id from applications a
     join auth.users u on u.id = a.user_id
    where lower(u.email) = lower(:'test_email'));

delete from applications
 where user_id = (select id from auth.users where lower(email) = lower(:'test_email'));

commit;


-- ── 3. DELETE the auth user ─────────────────────────────────
-- Last, and separate. Until this runs, re-importing the same address fails with
-- "email already registered" — which is exactly the state the route's rollback
-- now prevents on failure, but a SUCCESSFUL test still leaves it behind.
--
-- profiles.id references auth.users; if the FK is not ON DELETE CASCADE this
-- errors and the profile row must go first. Uncomment if needed.
-- delete from profiles
--  where id = (select id from auth.users where lower(email) = lower(:'test_email'));

delete from auth.users where lower(email) = lower(:'test_email');


-- ── 4. CONFIRM — all four counts must be 0 ──────────────────
select
  (select count(*) from auth.users where lower(email) = lower(:'test_email')) as auth_users,
  (select count(*) from applications a join auth.users u on u.id = a.user_id
    where lower(u.email) = lower(:'test_email')) as applications,
  (select count(*) from profiles p join auth.users u on u.id = p.id
    where lower(u.email) = lower(:'test_email')) as profiles,
  'want 0 / 0 / 0' as expected;
