-- Migration 049: sponsor owner UPDATE + commercial clamp, and close the
-- public-insert hole that mirrors it.
-- Verification: supabase/verify/verify_049.sql
--
-- POLICIES THAT ALREADY EXIST ON sponsorships (enumerated first, per the rule
-- in HANDOFF §4 — this is the table where a permissive baseline hid an owner
-- path twice already):
--   "sponsorships: admin write"             FOR ALL   using is_admin()
--   "Sponsors can read own sponsorship"     SELECT    user_id = auth.uid() or is_admin()
--   "Anyone can submit sponsor application" INSERT    with check (status = 'pending')
-- There is NO owner UPDATE. That is why the portal's sponsor profile save has
-- never worked — it now reports a real error instead of a false success, and
-- this migration is what lets it actually save.
begin;

-- ── 1. Owner UPDATE ─────────────────────────────────────────
create policy "sponsorships: own update"
  on sponsorships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ── 2. The clamp — AN ALLOW-LIST, NOT A DENY-LIST ───────────
-- This deliberately inverts 041's approach, and the difference matters.
--
-- 041 enumerates the columns a non-admin may NOT change. That is correct today
-- and silently wrong tomorrow: every column added to `applications` after it is
-- editable by an owner unless someone remembers to extend the trigger. Nothing
-- fails, nothing warns — the field is simply writable.
--
-- Here the rule is inverted. NEW is rebuilt from OLD and only the seven listed
-- keys are taken from the submitted row, so a column added to `sponsorships`
-- next year is protected by default and someone has to deliberately opt it in.
-- On a table holding tier, amount, placement and lock flags, defaulting to
-- protected is the only safe direction.
--
-- Protected by omission — every commercial and placement field:
--   sponsor_name, tier, amount, status, is_in_kind, amount_locked,
--   hold_expires_at, show_on_homepage, featured_footer, homepage_order,
--   additional_items, notes, event_id, user_id, created_at
create or replace function public.sponsorships_protect_commercial_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  -- The ONLY fields a sponsor may edit about themselves: how to reach them,
  -- and how they present. Nothing about what they bought or where it appears.
  allowed constant text[] := array[
    'contact_name', 'email', 'phone',
    'website', 'instagram', 'facebook',
    'logo_url'
  ];
  patch jsonb := '{}'::jsonb;
  k text;
begin
  -- auth.uid() is null only for service_role / trusted server contexts. Same
  -- exemption as migration 043 — triggers are NOT bypassed by the service role
  -- the way RLS is, and omitting this breaks every server-side write.
  if public.is_admin() or auth.uid() is null then return new; end if;

  foreach k in array allowed loop
    patch := patch || jsonb_build_object(k, to_jsonb(new) -> k);
  end loop;

  -- Rebuild from OLD, overriding only the allowed keys.
  new := jsonb_populate_record(new, to_jsonb(old) || patch);
  return new;
end $$;

comment on function public.sponsorships_protect_commercial_columns is
  'Allow-list clamp: a sponsor may edit contact details, website, socials and logo. Every other column — tier, amount, status, placement flags, amount_locked, hold_expires_at — is restored from OLD. New columns are protected by default, unlike the deny-list in 041.';

-- Named to sort BEFORE sponsorships_updated_at: PostgreSQL fires same-timing
-- triggers in alphabetical order, so the clamp runs first and updated_at is
-- still stamped afterwards.
drop trigger if exists sponsorships_protect_commercial_columns_trg on sponsorships;
create trigger sponsorships_protect_commercial_columns_trg
  before update on sponsorships
  for each row execute function public.sponsorships_protect_commercial_columns();


-- ── 3. THE INSERT HOLE — found while enumerating for (1) ────
-- "Anyone can submit sponsor application" is `with check (status = 'pending')`.
-- RLS is row-level, so that constrains ONE column: the public sponsor form —
-- or anything posting to it — can set every other column on its own insert.
-- Exactly the defect migration 031 fixed on `applications`, still open here.
--
-- It matters more now than it did an hour ago. With (1) in place, a submission
-- that sets `user_id` to its own account SELF-LINKS the sponsorship, bypassing
-- the admin linking step entirely and granting itself owner UPDATE. And
-- `amount_locked = true` on a self-submitted row is designed to resist
-- correction — it is the flag protecting grandfathered prices.
--
-- amount and tier are deliberately NOT clamped: they are the sponsor's
-- REQUEST, an admin confirms them, and recomputing the price here would
-- duplicate lib/sponsor-tiers.ts, which is the single source of truth.
create or replace function public.sponsorships_force_safe_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;

  new.status           := 'pending';
  new.user_id          := null;   -- linking is an ADMIN action, not self-service
  new.amount_locked    := false;
  new.is_in_kind       := false;
  new.hold_expires_at  := null;
  new.show_on_homepage := false;
  new.featured_footer  := false;
  new.homepage_order   := null;
  return new;
end $$;

comment on function public.sponsorships_force_safe_insert is
  'A public sponsor submission may only ever create a pending, unlinked, unplaced row. RLS with_check is row-level and cannot restrict which columns an insert may set, so the clamp lives here. tier and amount are left alone — they are the request an admin confirms.';

drop trigger if exists sponsorships_force_safe_insert_trg on sponsorships;
create trigger sponsorships_force_safe_insert_trg
  before insert on sponsorships
  for each row execute function public.sponsorships_force_safe_insert();

commit;
