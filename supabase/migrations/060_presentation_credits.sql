-- ============================================================
-- Migration 060: presentation_credits + presentation_credit_items
--
-- Implements CUTOVER section E2 (decided 2026-08-13), with ONE structural
-- change to the sketch. Migrates NOTHING - the four existing credits keep
-- rendering from presented_by_fallback until a dual-read is verified.
--
-- WHY THE JOIN TABLE. The sketch had schedule_item_id and panel_id as single
-- nullable columns on the credit itself: one item per credit. That cannot
-- express what is already sold. Whole Life Aftercare presents THE TATTOO
-- BATTLE, which is three schedule_items rows - Begins, Ends/Voting Opens, and
-- Champion Crowned. Under the sketch that is three credit rows for one sale,
-- each with its own amount and invoice_id, and any report summing amount either
-- triple-counts the sale or splits a price nobody split.
--
-- This was only visible because putting the Battle credit on all three rows
-- pushed verify_044 query F from 2 to 4. The counter did not signal that the
-- table was needed; it exposed that the design was wrong.
--
-- WHAT IS DELIBERATELY NOT HERE:
--
-- Prize sponsors. Skin Specialists and Market Roots fund pinup gift
-- certificates and stay in src/lib/event-config.ts. 'Presents an event' and
-- 'funds a prize' are different relationships: the first is a priced placement
-- with a billing lifecycle, the second is an in-kind donation whose substance
-- is the CERTIFICATE WORDING ('$200 Gift Certificate to Skin Specialists'),
-- which must never shorten to a bare figure. Forcing them in here would give
-- every prize row amount 0, invoice_id null and status confirmed forever -
-- three columns carrying no information - and would make this table report
-- 'credits sold' while including things nobody sold.
--
-- Exclusivity. Recorded separately and admin-only; see the report. Nothing in
-- this migration is exposed to anon.
-- ============================================================

create table if not exists public.presentation_credits (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,

  -- Denormalised on purpose, same reasoning as the booth history table: the
  -- credit must stay reportable if the sponsorship row is unlinked or deleted.
  -- None of the four credits live today HAS a sponsorship row, so this is the
  -- only name they have.
  buyer_name     text not null check (length(trim(buyer_name)) > 0),
  sponsorship_id uuid references public.sponsorships(id) on delete set null,
  invoice_id     uuid references public.invoices(id) on delete set null,

  -- Negotiated amount in cents. NOT derived from a tier: the three 2027 credits
  -- are off-tier ($7,500 and $5,000 against Gold $5,000 / Platinum $10,000), so
  -- a tier price would misstate every one of them.
  amount         int not null default 0 check (amount >= 0),

  -- Which tier the package was BASED ON, where one applies. Kept separately
  -- from amount so an off-tier deal records both the negotiated figure and the
  -- package it came from, instead of losing one to represent the other.
  based_on_tier  text,

  -- Mirrors sponsorships.is_in_kind (migration 030). An unpaid credit is
  -- STATED rather than inferred from amount = 0, which is also what a credit
  -- whose price nobody has entered yet looks like.
  is_in_kind     boolean not null default false,

  status         text not null default 'pending'
                   check (status in ('pending','confirmed','cancelled')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_presentation_credits_event
  on public.presentation_credits (event_id, status);

drop trigger if exists presentation_credits_updated_at on public.presentation_credits;
create trigger presentation_credits_updated_at
  before update on public.presentation_credits
  for each row execute function public.handle_updated_at();

-- ── the join: ONE sale, MANY items ──────────────────────────
create table if not exists public.presentation_credit_items (
  id               uuid primary key default gen_random_uuid(),
  credit_id        uuid not null references public.presentation_credits(id) on delete cascade,
  schedule_item_id uuid references public.schedule_items(id) on delete cascade,
  panel_id         uuid references public.panels(id) on delete cascade,
  created_at       timestamptz not null default now(),

  -- Exactly one target. A row pointing at both, or at neither, is not a credit
  -- against an item - it is a bug that would render twice or not at all.
  constraint presentation_credit_items_one_target
    check (num_nonnulls(schedule_item_id, panel_id) = 1)
);

-- An item may carry a credit from only one buyer. Two sponsors presenting the
-- same schedule item is a double-sale, and the database is a better place to
-- find that out than the printed programme.
create unique index if not exists uq_credit_item_schedule
  on public.presentation_credit_items (schedule_item_id)
  where schedule_item_id is not null;

create unique index if not exists uq_credit_item_panel
  on public.presentation_credit_items (panel_id)
  where panel_id is not null;

create index if not exists idx_credit_items_credit
  on public.presentation_credit_items (credit_id);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.presentation_credits      enable row level security;
alter table public.presentation_credit_items enable row level security;

-- PUBLIC READ IS LIMITED TO WHAT A PAGE RENDERS: the buyer's name, against the
-- item it presents. Amount, invoice, tier basis, status and notes are NOT
-- readable by anon - those are commercial terms. This is the opposite mistake
-- to sponsors_public, which exposes every confirmed sponsorship wholesale.
drop policy if exists "anon reads confirmed credit items" on public.presentation_credit_items;
create policy "anon reads confirmed credit items" on public.presentation_credit_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.presentation_credits c
     where c.id = credit_id and c.status = 'confirmed'
  ));

-- The credit row itself is ADMIN ONLY. The public read goes through the view
-- below, which exposes the name and nothing else.
drop policy if exists "admins read credits" on public.presentation_credits;
create policy "admins read credits" on public.presentation_credits
  for select to authenticated using (public.has_role(array['admin','sponsorship_manager']));

drop policy if exists "admins write credits" on public.presentation_credits;
create policy "admins write credits" on public.presentation_credits
  for all to authenticated
  using (public.has_role(array['admin','sponsorship_manager']))
  with check (public.has_role(array['admin','sponsorship_manager']));

drop policy if exists "admins write credit items" on public.presentation_credit_items;
create policy "admins write credit items" on public.presentation_credit_items
  for all to authenticated
  using (public.has_role(array['admin','sponsorship_manager']))
  with check (public.has_role(array['admin','sponsorship_manager']));

-- ── the public view: name and item, nothing else ────────────
-- Column-limited on purpose. sponsors_public exposes every column of every
-- confirmed sponsorship; this exposes a name and a foreign key, so a negotiated
-- amount cannot reach a page even by accident.
create or replace view public.presentation_credits_public
with (security_invoker = false) as
select ci.schedule_item_id,
       ci.panel_id,
       c.buyer_name,
       c.event_id
  from public.presentation_credit_items ci
  join public.presentation_credits c on c.id = ci.credit_id
 where c.status = 'confirmed';

grant select on public.presentation_credits_public to anon, authenticated;
revoke select on public.presentation_credits, public.presentation_credit_items from anon;

comment on table public.presentation_credits is
  'One SALE of a presentation credit. Items it covers are in presentation_credit_items - the Tattoo Battle is one credit across three schedule_items rows. Prize sponsors are NOT here; they live in src/lib/event-config.ts. Commercial terms (amount, invoice, tier basis, notes) are admin-only; only buyer_name reaches the public view.';
