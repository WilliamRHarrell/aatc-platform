-- ============================================================
-- Migration 028: Break the applications <-> invoices RLS cycle
--
-- THE CYCLE
--   applications: public read deposit-paid  ->  EXISTS on invoices   (mig 024)
--   invoices: own read                      ->  EXISTS on applications (mig 001)
-- Mutual recursion. Postgres aborts with:
--   42P17 infinite recursion detected in policy for relation "invoices"
--
-- Measured impact before this migration, with the ANON key (which is what every
-- public surface actually uses — no public page reads via service role):
--   /directory          applications  -> 42P17
--   /directory          booths        -> 42P17
--   /directory/artists                -> 42P17
--   service role ground truth         -> 12 approved applications
-- The public artist/vendor directory has been returning nothing to real
-- visitors. Migration 025 was only ONE entry point into the loop, from
-- sponsorships; removing it does not fix the underlying cycle.
--
-- THE FIX
-- Replace the cross-table EXISTS subqueries with SECURITY DEFINER helpers. The
-- function owner is not subject to RLS on the inner query, so evaluating a
-- policy can no longer re-enter the policy graph. search_path is pinned on
-- every helper — an unpinned definer function is a privilege-escalation vector.
--
-- Both sides are converted, not just one. Breaking a single side is enough for
-- termination, but leaves every invoice row triggering a nested applications
-- policy evaluation. Converting both makes re-formation structurally
-- impossible rather than incidentally avoided.
--
-- `booths: public read deposit-paid` (mig 024) is converted too: its own qual
-- joins applications AND invoices, so it enters the same loop independently —
-- it is not merely an entry point.
-- ============================================================

-- ── Helper: has this application paid its deposit? ──────────
create or replace function public.has_paid_deposit(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.invoices i
     where i.application_id = p_application_id
       and i.deposit_paid_at is not null
  );
$$;

revoke all on function public.has_paid_deposit(uuid) from public;
grant execute on function public.has_paid_deposit(uuid) to anon, authenticated;

comment on function public.has_paid_deposit(uuid) is
  'Deposit check for the public directory policy. SECURITY DEFINER so the invoices read does not re-enter RLS and re-form the applications<->invoices cycle.';

-- ── Helper: is this booth''s application publicly listable? ──
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
      join public.invoices i on i.application_id = a.id
     where a.id = p_application_id
       and a.status = 'approved'
       and a.needs_roster = false
       and i.deposit_paid_at is not null
  );
$$;

revoke all on function public.booth_publicly_visible(uuid) from public;
grant execute on function public.booth_publicly_visible(uuid) to anon, authenticated;

comment on function public.booth_publicly_visible(uuid) is
  'Public booth visibility. SECURITY DEFINER for the same reason as has_paid_deposit.';

-- ── Recreate the two public policies without cross-table EXISTS ──
-- Prior definitions preserved verbatim so they can be restored. Note that
-- restoring either as written reintroduces the 42P17 cycle.
--
-- migration 024:
--   create policy "applications: public read deposit-paid"
--     on applications for select
--     to anon, authenticated
--     using (
--       status = 'approved'
--       and needs_roster = false
--       and exists (
--         select 1 from invoices i
--          where i.application_id = applications.id
--            and i.deposit_paid_at is not null
--       )
--     );
--
--   create policy "booths: public read deposit-paid"
--     on booths for select
--     to anon, authenticated
--     using (
--       application_id is not null
--       and exists (
--         select 1 from applications a
--           join invoices i on i.application_id = a.id
--          where a.id = booths.application_id
--            and a.status = 'approved'
--            and a.needs_roster = false
--            and i.deposit_paid_at is not null
--       )
--     );

drop policy if exists "applications: public read deposit-paid" on applications;
create policy "applications: public read deposit-paid"
  on applications for select
  to anon, authenticated
  using (
    status = 'approved'
    and needs_roster = false
    and public.has_paid_deposit(id)
  );

drop policy if exists "booths: public read deposit-paid" on booths;
create policy "booths: public read deposit-paid"
  on booths for select
  to anon, authenticated
  using (
    application_id is not null
    and public.booth_publicly_visible(application_id)
  );
