-- Migration 090: food-truck owners in the portal (Invite & link for trucks).
--
-- Ryan, 2026-10-05: the three imported trucks get portal access through
-- Invite & link. The portal already shows a linked truck (food_trucks: own
-- read, "Vendors update own food_truck"), but three things were wrong for an
-- owner, found 2026-10-05:
--   1. invoices: own read uses owns_invoice(application_id, sponsorship_id),
--      so a truck owner could not see - or pay - their own invoice.
--   2. "Vendors update own food_truck" lets an owner change EVERY column of
--      their row: days (the price), is_published (self-publishing on the
--      rodeo page), email, event. The portal form only edits the profile.
--   3. Storage: "Vendors insert / update own food truck logos" only check
--      auth.uid() IS NOT NULL, so ANY signed-in account (every artist and
--      vendor) could overwrite ANY truck's public logo.
--
-- Existing policies, enumerated before changing (pg_policies, replay of 001-089):
--   food_trucks: "Vendors update own food_truck" UPDATE (user_id = auth.uid()),
--                "food_trucks: editorial write" ALL has_role(admin, content_editor),
--                "food_trucks: own read" SELECT (user_id = auth.uid()).
--   invoices:    "invoices: admin all" ALL is_admin(),
--                "invoices: own read" SELECT owns_invoice(application_id, sponsorship_id, auth.uid()).
--   storage.objects (food-truck-logos): "Admin insert/delete food truck logos",
--                "Public read food truck logos", "Vendors insert own food truck logos"
--                (auth.uid() is not null), "Vendors update own food truck logos" (same).
-- Only the two vendor storage policies are replaced; one invoice policy is
-- added; the rest stand.

begin;

-- ── 1. a truck owner reads their truck's invoice ────────────
-- food_trucks' own policies never read invoices, so this cannot recurse.
drop policy if exists "invoices: own food truck read" on public.invoices;
create policy "invoices: own food truck read"
  on public.invoices for select to authenticated
  using (food_truck_id is not null
         and exists (select 1 from public.food_trucks t where t.id = invoices.food_truck_id and t.user_id = auth.uid()));

-- ── 2. owners edit the profile only ─────────────────────────
-- Staff (admin, content_editor: "food_trucks: editorial write") and trusted
-- server contexts are exempt.
create or replace function public.food_trucks_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null or public.has_role(array['admin', 'content_editor']) then return new; end if;
  new.event_id       := old.event_id;
  new.user_id        := old.user_id;
  new.email          := old.email;
  new.days           := old.days;
  new.thursday_setup := old.thursday_setup;
  new.is_published   := old.is_published;
  return new;
end $$;
drop trigger if exists food_trucks_protect_staff_columns_trg on public.food_trucks;
create trigger food_trucks_protect_staff_columns_trg
  before update on public.food_trucks
  for each row execute function public.food_trucks_protect_staff_columns();
revoke execute on function public.food_trucks_protect_staff_columns() from public, anon, authenticated;

-- ── 3. logos: only into your own truck's folder (<truck id>/...) ──
drop policy if exists "Vendors insert own food truck logos" on storage.objects;
drop policy if exists "Vendors update own food truck logos" on storage.objects;
create policy "Vendors insert own food truck logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'food-truck-logos'
              and (storage.foldername(name))[1] in (select t.id::text from public.food_trucks t where t.user_id = auth.uid()));
create policy "Vendors update own food truck logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'food-truck-logos'
         and (storage.foldername(name))[1] in (select t.id::text from public.food_trucks t where t.user_id = auth.uid()))
  with check (bucket_id = 'food-truck-logos'
              and (storage.foldername(name))[1] in (select t.id::text from public.food_trucks t where t.user_id = auth.uid()));

commit;
