-- ============================================================
-- Migration 035: Atomic application lifecycle transitions
--
-- The lifecycle sweep did this as two separate round trips:
--
--   update applications set status = 'expired'   where id = ...
--   update booths set application_id = null,
--                     status = 'available'       where application_id = ...
--
-- Both statements are individually correct — status IS reset to available, so
-- the sweep never left a booth flagged reserved with nobody in it. The defect
-- is that they are not atomic. If the process dies, the function times out, or
-- the second call fails between them, the application is expired while its
-- booth stays assigned: a booth held by an expired application, invisible to
-- both the "available booths" view and the exhibitor.
--
-- These functions collapse each transition into one statement pair inside a
-- single transaction, so it either fully happens or not at all.
--
-- SECURITY DEFINER because the caller is the cron route using the service role;
-- pinned search_path per the same rule as every other definer function here.
-- ============================================================

create or replace function public.expire_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update applications
     set status = 'expired'
   where id = p_application_id
     and status = 'approved';   -- no-op if something already moved it

  if not found then
    return;
  end if;

  update booths
     set application_id = null,
         status         = 'available'
   where application_id = p_application_id;
end;
$$;

create or replace function public.cancel_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update applications
     set status = 'canceled'
   where id = p_application_id
     and status = 'approved';

  if not found then
    return;
  end if;

  update booths
     set application_id = null,
         status         = 'available'
   where application_id = p_application_id;
end;
$$;

revoke all on function public.expire_application(uuid) from public;
revoke all on function public.cancel_application(uuid) from public;
-- service_role only: these release booths and must never be callable from a
-- browser session, admin or otherwise.
grant execute on function public.expire_application(uuid) to service_role;
grant execute on function public.cancel_application(uuid) to service_role;

comment on function public.expire_application(uuid) is
  'Atomically expire an approved application and release its booths. Guarded on status=approved so a concurrent change cannot be clobbered.';
comment on function public.cancel_application(uuid) is
  'Atomically cancel an approved application and release its booths.';

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'expire_application')
     or not exists (select 1 from pg_proc where proname = 'cancel_application') then
    raise exception 'Migration 035 FAILED: lifecycle functions not created.';
  end if;
  raise notice 'Migration 035 OK — atomic expire/cancel installed.';
end $$;
