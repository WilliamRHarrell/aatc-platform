-- ============================================================
-- Migration 027: Pin search_path on is_admin()
--
-- Migration 001 created is_admin() as SECURITY DEFINER with no search_path.
-- A definer function runs with the owner's privileges, so an unpinned
-- search_path is a privilege-escalation vector: anything able to set
-- search_path for its session can shadow `profiles` with its own relation and
-- make is_admin() return true.
--
-- is_admin() gates every admin write policy in the schema, so this is the
-- highest-value line in the four migrations even though it is the shortest.
--
-- Idempotent: create or replace, no policy churn. Nothing else references the
-- function signature, so no dependent objects need rebuilding.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'admin'
  );
$$;

-- Definer functions should never be executable by `public` implicitly.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

comment on function public.is_admin() is
  'True when the calling user has role=admin. SECURITY DEFINER with pinned search_path — do not remove the SET, it is what stops search_path shadowing.';
