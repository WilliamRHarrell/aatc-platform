-- ============================================================
-- TEARDOWN 2026-09-25 (round 2): the PR #12 test rows.
--   application 9800610c "Tesrt booth" (artist, pending, no invoice, no
--     receipt sent) owned by the test account ff3f28f5
--     (ryan+boothtest@ryanharrell.com, profile "ryan H Test", role public)
--   panel registration 158162f3 "Ryan Test" (ryan+paneltest@ryanharrell.com)
--     on the Bookkeeping seminar, payment_status na
--   the test ACCOUNT: auth.users ff3f28f5 - profiles and applications cascade
--     from it (001), and the application is deleted explicitly first anyway.
-- No sponsorship was created this round. Storage: no objects under the
-- test user's folders (checked 2026-09-25).
--
-- HOW TO RUN: paste the whole file. ABORTS before writing unless every fact
-- matches. Read the MESSAGES pane.
-- ============================================================
begin;

do $$
declare
  v_app uuid := '9800610c-e863-4bb3-934b-ca887b503b4f';
  v_uid uuid := 'ff3f28f5-97e4-4aa0-9330-2f6447f1e8a9';
  v_reg uuid := '158162f3-6657-48ae-8eb4-ca2c118a5322';
  n int;
begin
  if (select business_name from public.applications where id = v_app) is distinct from 'Tesrt booth' then raise exception 'ABORT: 9800610c is not "Tesrt booth" (or already deleted)'; end if;
  if (select user_id from public.applications where id = v_app) is distinct from v_uid then raise exception 'ABORT: application owner is not the test account'; end if;
  if (select email from public.profiles where id = v_uid) is distinct from 'ryan+boothtest@ryanharrell.com' then raise exception 'ABORT: profile ff3f28f5 is not the test account'; end if;
  if (select role::text from public.profiles where id = v_uid) <> 'public' then raise exception 'ABORT: test account is not role public - refusing to delete'; end if;
  n := (select count(*) from public.applications where user_id = v_uid);
  if n <> 1 then raise exception 'ABORT: test account owns % applications, expected 1', n; end if;
  if exists (select 1 from public.invoices where application_id = v_app) then raise exception 'ABORT: an invoice references the application'; end if;
  if exists (select 1 from public.booths where application_id = v_app) then raise exception 'ABORT: a booth references the application'; end if;
  if (select email from public.panel_registrations where id = v_reg) is distinct from 'ryan+paneltest@ryanharrell.com' then raise exception 'ABORT: panel registration 158162f3 is not the test row'; end if;
  raise notice 'PRE-STATE OK';

  delete from public.panel_registrations where id = v_reg;
  delete from public.applications where id = v_app;
  delete from auth.users where id = v_uid;   -- cascades to profiles (001)

  if exists (select 1 from public.applications where id = v_app) then raise exception 'FAIL: application still present'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then raise exception 'FAIL: profile still present'; end if;
  if exists (select 1 from auth.users where id = v_uid) then raise exception 'FAIL: auth user still present'; end if;
  if exists (select 1 from public.panel_registrations where id = v_reg) then raise exception 'FAIL: panel registration still present'; end if;
  raise notice 'DONE: removed application 9800610c, panel registration 158162f3, and the test account ff3f28f5 (auth user + profile)';
end $$;

commit;

-- Results grid: want zero rows.
select 'application' as t, id::text from public.applications where business_name = 'Tesrt booth'
union all select 'profile', id::text from public.profiles where email = 'ryan+boothtest@ryanharrell.com'
union all select 'panel_reg', id::text from public.panel_registrations where email = 'ryan+paneltest@ryanharrell.com';
