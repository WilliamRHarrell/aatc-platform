-- ============================================================
-- Migration 073: revoke EXECUTE from anon (and PUBLIC) on every function that
-- was never meant for anon. Verification: supabase/verify/verify_073.sql
--
-- WHAT WENT WRONG. Supabase grants EXECUTE on every new function in `public`
-- to anon, authenticated and service_role through ALTER DEFAULT PRIVILEGES.
-- `revoke all on function ... from public` removes only the PUBLIC
-- pseudo-role's grant; anon's explicit grant from the default privileges
-- survives it. So "revoke from public; grant to authenticated" (035, 039,
-- 072) left anon able to execute. 069 had it right (`revoke execute ... from
-- anon` as well) and the pattern did not carry to the next branch.
--
-- FOUND LIVE 2026-09-24 by verify_072 block B, then probed with the anon key
-- against production (nil UUID, no matching row, so no effect):
--   comp_application      anon: "permission denied" (Ryan's stopgap revoke landed)
--   uncomp_application    anon: "not allowed" (executable; is_admin() refused)
--   expire_application    anon: HTTP 204 - EXECUTABLE, NO INTERNAL CHECK
--   cancel_application    anon: HTTP 204 - EXECUTABLE, NO INTERNAL CHECK
--   has_role, owns_invoice  anon: executable, return false (read-only booleans)
-- expire/cancel are the serious ones: SECURITY DEFINER, no guard, and
-- application ids are public on /directory/[id]. Anyone could have expired
-- or canceled an approved application and released its booths. Live data
-- checked the same day: zero expired/canceled rows, every booth available.
--
-- TWO FIXES, BOTH. Grants are the boundary; an internal guard is the belt.
--   1. Revoke EXECUTE from anon and PUBLIC on every function below; re-grant
--      exactly the intended roles.
--   2. expire_application / cancel_application gain the guard they never had:
--      only the service role (the sweep) or an admin may call them.
-- Functions MEANT for anon keep their grants and are listed in verify_073's
-- allow-list so the check is exact, not "nothing for anon".
--
-- Idempotent. No policy is touched (none exists on functions).
-- ============================================================
begin;

-- ── 1. Admin / authenticated-only ────────────────────────────
revoke execute on function public.comp_application(uuid)   from public, anon;
revoke execute on function public.uncomp_application(uuid) from public, anon;
grant  execute on function public.comp_application(uuid)   to authenticated;
grant  execute on function public.uncomp_application(uuid) to authenticated;

revoke execute on function public.has_role(text[]) from public, anon;
grant  execute on function public.has_role(text[]) to authenticated;

revoke execute on function public.owns_invoice(uuid, uuid, uuid) from public, anon;
grant  execute on function public.owns_invoice(uuid, uuid, uuid) to authenticated;

-- 069 already revoked anon; restated so this file is the complete picture.
revoke execute on function public.set_tattoo_battle_champion(uuid) from public, anon;
grant  execute on function public.set_tattoo_battle_champion(uuid) to authenticated;

-- ── 2. Service-role-only lifecycle transitions (035) ─────────
revoke execute on function public.expire_application(uuid) from public, anon, authenticated;
revoke execute on function public.cancel_application(uuid) from public, anon, authenticated;
grant  execute on function public.expire_application(uuid) to service_role;
grant  execute on function public.cancel_application(uuid) to service_role;

-- Internal guard. auth.role() is the JWT role claim: 'service_role' for the
-- sweep's key, 'anon' / 'authenticated' otherwise. Admins may also call them
-- (nothing does today; the guard states who is allowed, not who happens to).
create or replace function public.expire_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update applications
     set status = 'expired'
   where id = p_application_id
     and status = 'approved';   -- no-op if something already moved it
  update booths
     set application_id = null,
         status         = 'available'
   where application_id = p_application_id;
end $$;

create or replace function public.cancel_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update applications
     set status = 'canceled'
   where id = p_application_id
     and status = 'approved';
  update booths
     set application_id = null,
         status         = 'available'
   where application_id = p_application_id;
end $$;

-- Default privileges apply only when a NEW object is created; CREATE OR
-- REPLACE keeps the existing ACL. Restated anyway so this file is complete
-- on its own and cannot be wrong about it.
revoke execute on function public.expire_application(uuid) from public, anon, authenticated;
revoke execute on function public.cancel_application(uuid) from public, anon, authenticated;
grant  execute on function public.expire_application(uuid) to service_role;
grant  execute on function public.cancel_application(uuid) to service_role;

comment on function public.expire_application(uuid) is
  'Atomically expire an approved application and release its booths. service_role (the sweep) or an admin only - guarded inside (073) AND by grants. Guarded on status=approved so a concurrent change cannot be clobbered.';
comment on function public.cancel_application(uuid) is
  'Atomically cancel an approved application and release its booths. service_role (the sweep) or an admin only - guarded inside (073) AND by grants.';

commit;
