-- ============================================================
-- Migration 030: Homepage sponsor placement
--
-- Renumbered from 027 (never applied) so the three RLS prerequisites sort and
-- replay before it: 027 pins is_admin()'s search_path, 028 breaks the
-- applications<->invoices cycle, 029 lets sponsors read their own invoices.
-- This migration assumes those have run.
--
-- Nothing here subqueries invoices. Migration 025's sponsorship policy did,
-- which is how sponsorships became an entry point into the 42P17 cycle;
-- payment is now enforced by admin action (ticking a placement flag), not by
-- RLS. That is also what makes trade / in-kind sponsors possible — Title tier,
-- host-hotel arrangements — which have no invoice row and could never satisfy
-- the old paid-invoice gate no matter what an admin ticked.
--
-- SURFACE AUDIT — every non-admin read of sponsorships, and what serves it:
--   SiteFooter          featured_footer=true, confirmed    -> public policy
--   homepage grid       show_on_homepage=true, confirmed   -> public policy
--   /sponsors directory confirmed, NO placement flag       -> public policy
--                       (a placement-only policy would silently empty it)
--   /sponsors/packages  needs pending+confirmed tier counts to grey out
--                       sold-out limited tiers -> sponsor_tier_counts() RPC,
--                       so pending rows stay private but counts still work
--   /portal             user_id = auth.uid()               -> owner policy
--
-- Fully idempotent: every statement is IF NOT EXISTS / OR REPLACE / DROP IF
-- EXISTS, so re-running is a no-op. Runs as one transaction — the blanket
-- baseline is dropped in the same transaction that installs its replacements,
-- so there is no window where sponsorships is readable by nobody.
-- ============================================================

begin;

-- ── Columns ─────────────────────────────────────────────────
alter table sponsorships
  add column if not exists show_on_homepage boolean not null default false;

alter table sponsorships
  add column if not exists homepage_order integer;

-- Trade / in-kind sponsors: no invoice will ever exist for these.
alter table sponsorships
  add column if not exists is_in_kind boolean not null default false;

comment on column sponsorships.show_on_homepage is
  'Render this sponsor in the homepage sponsor grid.';
comment on column sponsorships.homepage_order is
  'Manual sort order for the homepage grid; nulls sort last, then tier, then name.';
comment on column sponsorships.is_in_kind is
  'Trade/in-kind sponsor with no invoice (e.g. Title tier, host hotel). Recorded so unpaid-but-intentional placements are diagnosable.';

create index if not exists sponsorships_homepage_idx
  on sponsorships (show_on_homepage, homepage_order)
  where show_on_homepage = true;

-- ── Superseded policies ─────────────────────────────────────
-- Definitions preserved verbatim so they can be restored.
--
-- migration 001 (the only blanket qual:true left in the schema):
--   create policy "sponsorships: public read"
--     on sponsorships for select using (true);
--
-- migration 019:
--   create policy "Public can read featured footer sponsors"
--     on sponsorships for select
--     using (featured_footer = true and status = 'confirmed');
--
-- migration 025 — DO NOT restore as written; this is the sponsorships entry
-- point into the 42P17 cycle:
--   create policy "Public can read paid featured sponsors"
--     on sponsorships for select
--     to anon, authenticated
--     using (
--       featured_footer = true
--       and status = 'confirmed'
--       and exists (
--         select 1 from invoices i
--          where i.sponsorship_id = sponsorships.id
--            and i.final_paid_at is not null
--       )
--     );

-- Pinned to the five policies confirmed present on the live database.
-- DROPPED:
drop policy if exists "sponsorships: public read" on sponsorships;              -- qual: true
drop policy if exists "Public can read paid featured sponsors" on sponsorships; -- 025, recursive
-- Superseded names from earlier iterations of this work; harmless if absent.
drop policy if exists "Public can read featured footer sponsors" on sponsorships;
drop policy if exists "Public can read paid placed sponsors" on sponsorships;
drop policy if exists "Public can read placed sponsors" on sponsorships;
-- LEFT INTACT (do not drop):
--   "Anyone can submit sponsor application"  (INSERT)
--   "sponsorships: admin write"              (ALL, using is_admin())

-- ── Public read: confirmed sponsors only ────────────────────
-- Serves the footer, the homepage grid and the /sponsors directory. Pending
-- applications and their contact details stop being world-readable.
drop policy if exists "Public can read confirmed sponsors" on sponsorships;
create policy "Public can read confirmed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (status = 'confirmed');

-- ── Owner read ──────────────────────────────────────────────
-- Reconciled with the live policy of the same name, not duplicated: dropped
-- and recreated deliberately. The live qual is
--     (user_id = auth.uid()) OR is_admin()
-- and the is_admin() arm is preserved verbatim. It is redundant — the
-- "sponsorships: admin write" policy is FOR ALL, which covers SELECT — but
-- recreating it identically keeps this migration a pure no-op for admins
-- rather than a silent behavioural change bundled into an RLS fix.
drop policy if exists "Sponsors can read own sponsorship" on sponsorships;
create policy "Sponsors can read own sponsorship"
  on sponsorships for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ── Sold-out tier counts without exposing pending rows ──────
-- /sponsors/packages greys out limited tiers once taken, which needs pending
-- AND confirmed counts. SECURITY DEFINER so it can count rows the caller
-- cannot read; returns aggregates only — no names, emails or amounts.
create or replace function public.sponsor_tier_counts(p_event_id uuid)
returns table (tier sponsor_tier, taken bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select s.tier, count(*) as taken
    from public.sponsorships s
   where s.event_id = p_event_id
     and s.status in ('confirmed', 'pending')
   group by s.tier;
$$;

revoke all on function public.sponsor_tier_counts(uuid) from public;
grant execute on function public.sponsor_tier_counts(uuid) to anon, authenticated;

-- ── Acceptance check ────────────────────────────────────────
-- Assert the FINAL policy set rather than inferring success from the absence
-- of an error. Runs inside the transaction, so a mismatch rolls the whole
-- migration back and leaves the database exactly as it was.
do $$
declare
  expected text[] := array[
    'Anyone can submit sponsor application',
    'Public can read confirmed sponsors',
    'Sponsors can read own sponsorship',
    'sponsorships: admin write'
  ];
  actual   text[];
  offender text;
begin
  select array_agg(policyname order by policyname)
    into actual
    from pg_policies
   where schemaname = 'public' and tablename = 'sponsorships';

  if actual is distinct from (select array_agg(x order by x) from unnest(expected) x) then
    raise exception
      'Migration 030 acceptance FAILED. Expected policies %, found %.',
      expected, coalesce(actual, '{}');
  end if;

  -- Nothing on sponsorships may reference invoices — that is the 42P17 cycle.
  select policyname
    into offender
    from pg_policies
   where schemaname = 'public'
     and tablename = 'sponsorships'
     and (coalesce(qual, '') like '%invoices%' or coalesce(with_check, '') like '%invoices%')
   limit 1;

  if offender is not null then
    raise exception
      'Migration 030 acceptance FAILED: policy "%" still subqueries invoices.', offender;
  end if;

  -- The blanket qual must be gone, not merely shadowed.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'sponsorships' and qual = 'true'
  ) then
    raise exception 'Migration 030 acceptance FAILED: a qual:true policy remains on sponsorships.';
  end if;

  raise notice 'Migration 030 acceptance OK — % policies on sponsorships, none referencing invoices.',
    array_length(actual, 1);
end $$;

commit;
