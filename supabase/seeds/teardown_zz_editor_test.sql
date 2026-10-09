-- ============================================================
-- TEARDOWN: the application editor live test (editor PR 2, 2026-10-09).
--   Up to two applications made in /admin/applications/new:
--     "ZZ Editor Test Artist"  ryan+zzeditor1@ryanharrell.com
--     "ZZ Joes Vendor"         ryan+zzeditor2@ryanharrell.com
--   (the vendor was entered as "ZZ Joes Vendor", not the name in the PR steps;
--   production read 2026-10-09)
--   Their invoices cascade (001). A booth assigned to one is released
--   (001: on delete set null); a hold linked to one is unlinked (087).
--
-- STEP 1, BEFORE deleting (read-only): run this alone and keep the result;
-- it names each test application and every file stored for it.
--
--   select a.id as application_id, a.business_name, o.bucket_id, o.name
--     from public.applications a
--     left join storage.objects o
--       on (o.bucket_id = 'exhibitor-media'  and o.name like a.id::text || '/%')
--       or (o.bucket_id = 'application-docs' and o.name like 'admin/' || a.id::text || '/%')
--    where a.business_name in ('ZZ Editor Test Artist', 'ZZ Joes Vendor')
--    order by a.business_name, o.bucket_id, o.name;
--
-- STEP 2: paste this whole file into the SQL Editor. It ABORTS before
-- writing unless every fact matches: no account linked, not protected (082),
-- no money recorded on any invoice (a fully comped invoice is 'paid' at
-- $0 by set_comp and is fine), at most the two rows above. Read the
-- MESSAGES pane; the results grid should be empty.
--
-- STEP 3: storage is not touched from SQL. In Supabase > Storage delete,
-- for each application id from step 1:
--   exhibitor-media/<application id>/        (logo, photos, portfolio)
--   application-docs/admin/<application id>/ (IDs, veteran document)
-- Re-run the step 1 query with the ids in place of the name filter
-- (where o.name like '<id>/%' or o.name like 'admin/<id>/%'): want zero rows.
-- ============================================================
begin;

do $$
declare
  v_ids uuid[];
  n int;
begin
  select array_agg(id) into v_ids from public.applications
   where business_name in ('ZZ Editor Test Artist', 'ZZ Joes Vendor');
  n := coalesce(array_length(v_ids, 1), 0);
  if n = 0 then raise exception 'ABORT: no ZZ editor test application found (already deleted?)'; end if;
  if n > 2 then raise exception 'ABORT: % ZZ editor test applications, expected at most 2', n; end if;

  if exists (select 1 from public.applications where id = any(v_ids)
              and lower(email) not in ('ryan+zzeditor1@ryanharrell.com', 'ryan+zzeditor2@ryanharrell.com')) then
    raise exception 'ABORT: a ZZ editor test application has an unexpected email';
  end if;
  if exists (select 1 from public.applications where id = any(v_ids) and user_id is not null) then
    raise exception 'ABORT: an account is linked (Invite & link was used); unlink it first or delete by hand';
  end if;
  if exists (select 1 from public.applications where id = any(v_ids) and is_protected) then
    raise exception 'ABORT: a ZZ editor test application is protected (082)';
  end if;
  if exists (select 1 from public.invoices where application_id = any(v_ids)
              and coalesce(amount_paid, 0) > 0) then
    raise exception 'ABORT: money is recorded on a test invoice; refusing to delete a payment record';
  end if;
  raise notice 'PRE-STATE OK: % application(s), % invoice(s), % booth(s) assigned',
    n,
    (select count(*) from public.invoices where application_id = any(v_ids)),
    (select count(*) from public.booths where application_id = any(v_ids));

  delete from public.applications where id = any(v_ids);   -- invoices cascade (001)

  if exists (select 1 from public.applications where id = any(v_ids)) then raise exception 'FAIL: application still present'; end if;
  if exists (select 1 from public.invoices where application_id = any(v_ids)) then raise exception 'FAIL: invoice still present'; end if;
  raise notice 'DONE: removed % ZZ editor test application(s) and their invoices: %', n, v_ids;
end $$;

commit;

-- Results grid 1: want zero rows.
select 'application' as t, id::text, business_name from public.applications
 where business_name in ('ZZ Editor Test Artist', 'ZZ Joes Vendor')
    or lower(email) in ('ryan+zzeditor1@ryanharrell.com', 'ryan+zzeditor2@ryanharrell.com');
