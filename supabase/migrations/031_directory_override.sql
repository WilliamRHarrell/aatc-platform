-- ============================================================
-- Migration 031: Per-exhibitor directory override + insert hardening
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
-- ── WHY THE INSERT HARDENING IS IN THE SAME MIGRATION ──
-- "applications: own insert" is `with check (auth.uid() = user_id)`. For an
-- INSERT policy pg_policies shows qual = NULL and the condition in with_check;
-- that is normal, not a missing check. But it constrains ONE column. RLS is
-- row-level, not column-level, so the policy permits an applicant to supply
-- ANY value for every other column in their own insert — including
-- status='approved', needs_roster=false, approved_at, total_amount, the
-- lifecycle due dates, and (once this migration lands) directory_override.
--
-- So without the trigger below, adding directory_override hands self-service
-- publication to anyone who can POST an application. The override and the
-- hardening therefore ship together; do not split them.
-- ============================================================

alter table applications
  add column if not exists directory_override boolean not null default false;

comment on column applications.directory_override is
  'Force a public directory listing despite no recorded deposit. Approval and roster completion are still required. Admin-set only — enforced by applications_force_safe_insert().';

create index if not exists applications_directory_override_idx
  on applications (directory_override)
  where directory_override = true;

-- ── Insert hardening ────────────────────────────────────────
-- Forces applicant-supplied inserts back to safe values. Admins are exempt so
-- the admin UI and import-returning keep working; service_role bypasses RLS and
-- triggers of this kind entirely, so the Stripe webhook is unaffected.
create or replace function public.applications_force_safe_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Lifecycle and gating columns are staff-controlled, whatever was submitted.
  new.status             := 'pending';
  new.needs_roster       := coalesce(new.needs_roster, false);
  new.directory_override := false;
  new.approved_at        := null;
  new.deposit_due_at     := null;
  new.final_due_at       := null;

  return new;
end;
$$;

drop trigger if exists applications_force_safe_insert_trg on applications;
create trigger applications_force_safe_insert_trg
  before insert on applications
  for each row execute function public.applications_force_safe_insert();

comment on function public.applications_force_safe_insert() is
  'Applicants may only ever create pending applications. RLS with_check is row-level and cannot restrict which columns an insert may set, so the clamp lives here.';

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
    raise exception 'Migration 031 FAILED: public read policy missing.';
  end if;

  -- The override must ADD to the gate, never replace approval or roster.
  if v_qual not like '%directory_override%' then
    raise exception 'Migration 031 FAILED: policy does not reference directory_override.';
  end if;
  if v_qual not like '%approved%' or v_qual not like '%needs_roster%' then
    raise exception
      'Migration 031 FAILED: approval/roster conditions missing from qual — the override must not bypass them. Found: %', v_qual;
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'applications_force_safe_insert_trg'
       and tgrelid = 'public.applications'::regclass
  ) then
    raise exception 'Migration 031 FAILED: insert-hardening trigger not installed.';
  end if;

  raise notice 'Migration 031 OK — override live, approval/roster preserved, insert hardening installed.';
end $$;
