-- Migration 096: an agreed total for applications the admin builds (application editor, PR 1).
--
-- Ryan, 2026-10-09: the admin application editor (recruits, Ink Master
-- artists) offers four money choices: standard price, a CUSTOM TOTAL, comp
-- booth, comp booth + permits. Comps already live on the row (comped_at,
-- permits_comped_at via set_comp(), 089). A custom total had no home while the
-- application is PENDING: total_amount is always the list price (comp.ts), and
-- a discount only exists on the invoice, which Approve creates. Ryan chose a
-- column (Option 1) over creating an invoice before approval.
--
-- applications.agreed_total (cents, nullable): when set, Approve invoices this
-- amount instead of the list price. total_amount stays the list price, so
-- set_comp(), permit fees and every report keep their meaning.
--
-- ADMIN ONLY: applications_protect_agreed_total (BEFORE INSERT OR UPDATE)
-- clears it on any non-admin insert and restores it on any non-admin update.
-- auth.uid() null (service role, migrations) is trusted, as in 079 / 089.
-- A separate trigger rather than a 15th line in the 079 clamp bodies: those
-- would have to be copied whole, which is how a clamp silently loses a line.
--
-- Existing policies, enumerated before changing (replay of 001-095, 2026-10-09):
--   "applications: admin all", "applications: own insert" (uid = user_id),
--   "applications: own read" (roles public, uid = user_id),
--   "applications: own update", "applications: staff read directory rows".
-- None change. (The open item to re-scope "own read" to authenticated waits
-- for a migration that touches applications POLICIES; this one does not.)
-- Not exposed in applications_public.

begin;

alter table public.applications
  add column if not exists agreed_total integer;
alter table public.applications drop constraint if exists applications_agreed_total_check;
alter table public.applications add constraint applications_agreed_total_check
  check (agreed_total is null or agreed_total >= 0);
comment on column public.applications.agreed_total is
  'Admin-agreed total in cents (application editor). When set, Approve invoices it instead of the list price; total_amount stays the list price. Admin only (096).';

create or replace function public.applications_protect_agreed_total()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.agreed_total := null;
  else new.agreed_total := old.agreed_total;
  end if;
  return new;
end $$;
drop trigger if exists applications_protect_agreed_total_trg on public.applications;
create trigger applications_protect_agreed_total_trg
  before insert or update on public.applications
  for each row execute function public.applications_protect_agreed_total();
revoke execute on function public.applications_protect_agreed_total() from public, anon, authenticated;

commit;
