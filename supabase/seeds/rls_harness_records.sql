-- ============================================================
-- RLS HARNESS TEST RECORDS
-- For scripts/verify-sponsor-visibility.mjs assertions 1 and 3.
-- Written against the schema as of migration 030.
--
-- PREREQUISITE - the auth user must exist first. Creating auth.users rows by
-- hand is fragile (instance_id, encrypted_password, confirmation columns), so
-- create it in the Dashboard instead:
--     Authentication -> Users -> Add user
--     email: rls-harness@allamericantattooconvention.com
--     Auto Confirm User: ON
-- Any password is fine and can be discarded - the harness mints its session via
-- the admin API (generateLink -> verifyOtp) and never uses one.
--
-- Then set VERIFY_SPONSOR_EMAIL=rls-harness@allamericantattooconvention.com
--
-- NOTE: the confirmed sponsorship below is deliberately PUBLICLY VISIBLE (it
-- has to be, to make the surface checks non-vacuous). It will appear on the
-- homepage grid, the footer and /sponsors under the name "ZZ TEST - RLS
-- Harness (DELETE ME)". Run the teardown before launch.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SETUP
-- ═══════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid;
  v_event_id uuid;
  v_role     user_role;
  v_pending  uuid;
begin
  select id into v_user_id
    from auth.users
   where email = 'rls-harness@allamericantattooconvention.com';

  if v_user_id is null then
    raise exception
      'Auth user not found. Create rls-harness@allamericantattooconvention.com in Authentication -> Users first.';
  end if;

  select id into v_event_id from events where is_active = true limit 1;
  if v_event_id is null then
    raise exception 'No active event.';
  end if;

  -- The harness must run as an ordinary user. An admin would satisfy every
  -- policy via is_admin() and the assertions would prove nothing.
  select role into v_role from profiles where id = v_user_id;
  if v_role = 'admin' then
    raise exception
      'Harness user has role=admin. Set it to ''exhibitor'' or ''public'' or the RLS assertions are meaningless.';
  end if;

  -- ── Record 1: PENDING sponsorship, owned by the harness user ──
  -- Serves assertion 1 (anon must NOT see a pending row) and assertion 3
  -- (the owner MUST see their own row regardless of status).
  insert into sponsorships (
    event_id, user_id, sponsor_name, tier, amount, status,
    contact_name, email, phone, instagram, facebook, notes,
    additional_items, featured_footer, show_on_homepage, is_in_kind
  ) values (
    v_event_id, v_user_id,
    'ZZ TEST - RLS Harness Pending (DELETE ME)',
    'brass', 50000, 'pending',
    'RLS Harness', 'rls-harness@allamericantattooconvention.com',
    '910-555-0100', 'rlsharness', 'rlsharness',
    'TEST RECORD - RLS verification harness. Safe to delete.',
    '{}', false, false, false
  )
  returning id into v_pending;

  -- ── Record 2: invoice on that sponsorship ──
  -- application_id is NULL and sponsorship_id is set: exactly the shape
  -- migration 001's "invoices: own read" qual could never match, which is why
  -- sponsors could not see their own invoices. Left unpaid on purpose - the
  -- owner must be able to read an UNPAID invoice.
  insert into invoices (
    application_id, sponsorship_id, amount, amount_paid, status, due_date
  ) values (
    null, v_pending, 50000, 0, 'pending', current_date + 30
  );

  -- ── Record 3 (optional): CONFIRMED, homepage-visible sponsorship ──
  -- Makes the surface checks non-vacuous. Not owned by the harness user, so
  -- assertion 3 cannot pass by accident through this row.
  insert into sponsorships (
    event_id, user_id, sponsor_name, tier, amount, status,
    contact_name, email, notes,
    additional_items, featured_footer, show_on_homepage, homepage_order, is_in_kind
  ) values (
    v_event_id, null,
    'ZZ TEST - RLS Harness (DELETE ME)',
    'gold', 300000, 'confirmed',
    'RLS Harness', 'rls-harness@allamericantattooconvention.com',
    'TEST RECORD - RLS verification harness. Publicly visible. Safe to delete.',
    '{}', true, true, 999, true
  );

  raise notice 'RLS harness records created. user=% event=% pending_sponsorship=%',
    v_user_id, v_event_id, v_pending;
end $$;


-- ═══════════════════════════════════════════════════════════
-- TEARDOWN - paste this block to remove everything above.
-- Order matters: invoices reference sponsorships, and sponsorships.user_id
-- references auth.users with no ON DELETE action, so the user must go last.
-- ═══════════════════════════════════════════════════════════
/*
delete from invoices
 where sponsorship_id in (
   select id from sponsorships where sponsor_name like 'ZZ TEST - RLS Harness%'
 );

delete from sponsorships
 where sponsor_name like 'ZZ TEST - RLS Harness%';

-- Optional: remove the harness account entirely (cascades to profiles).
-- Leave it if you intend to re-run the harness later.
delete from auth.users
 where email = 'rls-harness@allamericantattooconvention.com';

-- Confirm nothing is left behind.
select 'sponsorships' as tbl, count(*) from sponsorships where sponsor_name like 'ZZ TEST%'
union all
select 'invoices', count(*) from invoices
 where sponsorship_id in (select id from sponsorships where sponsor_name like 'ZZ TEST%')
union all
select 'auth.users', count(*) from auth.users
 where email = 'rls-harness@allamericantattooconvention.com';
*/
