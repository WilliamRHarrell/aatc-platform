-- ============================================================
-- Migration 032: Per-exhibitor directory override
--
-- The deposit gate from 024 stands. This adds an admin-set escape hatch for
-- exhibitors who will never have a recorded payment: guest artists, comped
-- booths, trade/in-kind arrangements. Default false, so the gate is still the
-- rule and every exception is an explicit act.
--
-- The override is an override on PAYMENT ONLY. status='approved' and
-- needs_roster=false are still required — an overridden exhibitor is one who
-- has been approved and has filed their roster, they simply have not paid
-- through the platform.
--
-- Requires migration 031 (insert hardening). Without it, directory_override
-- would be settable by an applicant in their own insert payload, handing them
-- self-service publication to the public directory.
-- ============================================================

alter table applications
  add column if not exists directory_override boolean not null default false;

comment on column applications.directory_override is
  'Force a public directory listing despite no recorded deposit. Approval and roster completion are still required. Admin-set only — enforced by the migration 031 trigger.';

create index if not exists applications_directory_override_idx
  on applications (directory_override)
  where directory_override = true;

-- ── Applications: deposit paid OR explicit override ─────────
-- Prior definition (migration 028) — the approval and roster conditions are
-- preserved exactly; only the payment term gains an alternative:
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

-- ── Booths: same override, still inside the definer helper ──
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
  v_qual text;
begin
  select qual into v_qual
    from pg_policies
   where schemaname = 'public'
     and tablename = 'applications'
     and policyname = 'applications: public read deposit-paid';

  if v_qual is null then
    raise exception 'Migration 032 FAILED: public read policy missing.';
  end if;

  -- The override must ADD to the gate, never replace approval or roster.
  if v_qual not like '%directory_override%' then
    raise exception 'Migration 032 FAILED: policy does not reference directory_override.';
  end if;
  if v_qual not like '%approved%' or v_qual not like '%needs_roster%' then
    raise exception
      'Migration 032 FAILED: approval/roster conditions missing from qual — the override must not bypass them. Found: %', v_qual;
  end if;

  raise notice 'Migration 032 OK — override live, approval/roster preserved.';
end $$;
