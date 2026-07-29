-- ============================================================
-- Migration 031: Harden application inserts
--
-- "applications: own insert" is `with check (auth.uid() = user_id)`. For an
-- INSERT policy pg_policies shows qual = NULL and the condition in with_check;
-- that is normal, not a missing check. But it constrains ONE column. RLS is
-- row-level, not column-level, so the policy lets an applicant supply ANY value
-- for every other column in their own insert — including:
--
--     status = 'approved'              self-approve
--     needs_roster = false             bypass the roster requirement
--     approved_at / deposit_due_at /
--       final_due_at                   set their own lifecycle, which arms the
--                                      lifecycle sweep against themselves
--     total_amount                     set their own price
--
-- This stands on its own — it closes a pre-existing hole and does not depend on
-- the directory override in migration 032. Apply it first.
--
-- Admins are exempt so the admin UI and import-returning keep working.
-- service_role bypasses RLS and is unaffected, so the Stripe webhook is fine.
-- ============================================================

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


-- ── Acceptance check ────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'applications_force_safe_insert_trg'
       and tgrelid = 'public.applications'::regclass
  ) then
    raise exception 'Migration 031 FAILED: insert-hardening trigger not installed.';
  end if;
  raise notice 'Migration 031 OK — applicant inserts clamped to pending.';
end $$;
