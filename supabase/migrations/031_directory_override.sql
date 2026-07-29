-- ============================================================
-- Migration 031: Per-exhibitor directory override
--
-- The deposit gate from migration 024 stands. This adds a deliberate,
-- admin-set escape hatch for exhibitors who will never have a recorded
-- payment: guest artists, comped booths, trade/in-kind arrangements.
--
-- Inverted by design — default false, so the gate remains the rule and every
-- exception is an explicit act by an admin rather than a silent bypass.
--
-- Applies to booths as well as applications. A comped exhibitor who appears in
-- the directory but whose booth number is suppressed would be a half-listing.
-- ============================================================

alter table applications
  add column if not exists directory_override boolean not null default false;

comment on column applications.directory_override is
  'Force a public directory listing regardless of deposit status. For guest artists, comped booths and trade/in-kind arrangements. Default false — the deposit gate is still the rule.';

create index if not exists applications_directory_override_idx
  on applications (directory_override)
  where directory_override = true;

-- ── Applications: deposit paid OR explicitly overridden ─────
-- Prior definition (migration 028):
--   using (
--     status = 'approved'
--     and needs_roster = false
--     and public.has_paid_deposit(id)
--   );
drop policy if exists "applications: public read deposit-paid" on applications;
create policy "applications: public read deposit-paid"
  on applications for select
  to anon, authenticated
  using (
    status = 'approved'
    and needs_roster = false
    and (public.has_paid_deposit(id) or directory_override = true)
  );

-- ── Booths: same override, via the definer helper ───────────
-- Kept inside the SECURITY DEFINER function so the booths policy still never
-- subqueries an RLS-protected table (see migration 028).
create or replace function public.booth_publicly_visible(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.applications a
     where a.id = p_application_id
       and a.status = 'approved'
       and a.needs_roster = false
       and (
         a.directory_override = true
         or exists (
           select 1 from public.invoices i
            where i.application_id = a.id
              and i.deposit_paid_at is not null
         )
       )
  );
$$;

revoke all on function public.booth_publicly_visible(uuid) from public;
grant execute on function public.booth_publicly_visible(uuid) to anon, authenticated;

-- ── Acceptance check ────────────────────────────────────────
do $$
declare
  n_override int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'applications'
       and column_name = 'directory_override'
  ) then
    raise exception 'Migration 031 FAILED: directory_override column missing.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'applications'
       and policyname = 'applications: public read deposit-paid'
       and qual like '%directory_override%'
  ) then
    raise exception 'Migration 031 FAILED: policy does not reference directory_override.';
  end if;

  select count(*) into n_override from applications where directory_override = true;
  raise notice 'Migration 031 OK — override column live, % exhibitor(s) currently overridden.', n_override;
end $$;
