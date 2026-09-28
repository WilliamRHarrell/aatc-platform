-- ============================================================
-- Migration 084: per-tier sponsorship price visibility.
-- Verification: supabase/verify/verify_084.sql
--
-- Package prices (Title, Platinum, Gold, Silver, Brass) are no longer shown
-- publicly; the individual items (Collectible Coin, Rafter Banner, VIP Bag,
-- Collector's Choice, Artist Lounge) still are. Whether a tier's price is
-- shown is an admin setting, one row per tier, read by /sponsors/packages,
-- /apply/sponsor and the sponsor receipt email.
--
-- THE PRICES ARE NOT HERE. They stay in src/lib/sponsor-prices.ts (server
-- only). This table holds a flag per tier and nothing else, so anon can read
-- it without learning a figure.
--
-- SEED = THE DEFAULTS (Ryan, 2026-09-28): packages hidden, items shown.
-- `on conflict do nothing`, so re-running never overwrites an admin choice.
-- A tier with no row is hidden by the app (fails closed).
--
-- RLS: anyone reads; admin and sponsorship_manager update (same predicate as
-- exclusivity_grants, 062). No INSERT or DELETE path from the app: the rows
-- are the tier enum, and a new tier comes with a migration.
-- POLICIES: a new table; nothing existing is touched.
-- ============================================================
begin;

create table if not exists public.sponsor_tier_settings (
  tier        sponsor_tier primary key,
  show_price  boolean not null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists sponsor_tier_settings_updated_at on public.sponsor_tier_settings;
create trigger sponsor_tier_settings_updated_at
  before update on public.sponsor_tier_settings
  for each row execute function public.handle_updated_at();

insert into public.sponsor_tier_settings (tier, show_price) values
  ('title', false), ('platinum', false), ('gold', false), ('silver', false), ('brass', false),
  ('collectible_coin', true), ('rafter_banner', true), ('vip_bag', true),
  ('collectors_choice', true), ('artist_lounge', true)
on conflict (tier) do nothing;

alter table public.sponsor_tier_settings enable row level security;

drop policy if exists "sponsor_tier_settings: public read" on public.sponsor_tier_settings;
create policy "sponsor_tier_settings: public read" on public.sponsor_tier_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "sponsor_tier_settings: admin update" on public.sponsor_tier_settings;
create policy "sponsor_tier_settings: admin update" on public.sponsor_tier_settings
  for update to authenticated
  using (public.has_role(array['admin','sponsorship_manager']))
  with check (public.has_role(array['admin','sponsorship_manager']));

-- Table grants to match: read for everyone, update for signed-in users (the
-- policy narrows it to admins), no insert/delete/truncate from the app.
revoke all on public.sponsor_tier_settings from anon, authenticated;
grant select on public.sponsor_tier_settings to anon, authenticated;
grant update (show_price) on public.sponsor_tier_settings to authenticated;

comment on table public.sponsor_tier_settings is
  'Per-tier flag: is this sponsorship tier''s list price shown publicly (084). Prices themselves live in src/lib/sponsor-prices.ts, never in the database or the browser bundle. Seeded packages hidden, items shown.';

commit;
