-- Migration 088: artist capacity (2 per single, 4 per double), roster guard,
-- per-artist ID verification.
--
-- Ryan, 2026-10-02: only 2 artists can be permitted per 10x10 (single) booth,
-- so 2 per single and 4 per double, everywhere. Until now the permit price was
-- capped at 4 per booth of any size while the apply form allowed 2/4. No
-- existing application exceeds 2/4 (read 2026-10-02).
--
-- Holes closed (found 2026-10-02):
--   - the owner update clamp (079) protects artist_count but not the
--     `artists` list, so an exhibitor could append artists past the permits
--     paid for with a direct API call;
--   - an exhibitor could silently replace a named artist and their ID after
--     AATC had filed the permit.
--
-- VERIFICATION lives on each artist entry as id_verified_at / id_verified_by
-- and is written ONLY by set_artist_id_verified() (admin). On every other
-- insert or update the database decides those two keys itself: carried
-- forward from the old entry with the same id_url, otherwise removed. So a
-- stale admin page or a client cannot set, keep or move a verification, and
-- replacing an ID clears it (the veteran-document rule, 071).
--
-- Policies are NOT changed. 079 is applied and is not edited:
-- application_list_price is replaced here with one line changed.

begin;

-- ── 1. capacity: 2 per single, 4 per double ─────────────────
-- 2026 rows (booth_size set) use the same rule by size.
alter table public.applications drop constraint if exists applications_artist_capacity;
alter table public.applications add constraint applications_artist_capacity check (
  exhibitor_type <> 'artist'
  or artist_count <= case booth_size
                       when 'single' then 2 when 'double' then 4 when 'triple' then 6 when 'quad' then 8
                       else artist_single_qty * 2 + artist_double_qty * 4
                     end
);

-- ── 2. list price: permits capped at the same rule ──────────
create or replace function public.application_list_price(
  p_exhibitor_type text,
  p_artist_single int, p_artist_double int, p_vendor_single int, p_vendor_double int,
  p_corner_count int, p_artist_count int,
  p_add_ons jsonb, p_is_veteran boolean
) returns int
language plpgsql immutable
set search_path = public, pg_catalog
as $$
declare
  -- Prices in CENTS. Mirror of src/lib/pricing.ts; verify_079_matrix pins equality.
  c_artist_single constant int := 80000;
  c_artist_double constant int := 120000;
  c_vendor_single constant int := 50000;
  c_vendor_double constant int := 80000;
  c_corner        constant int := 10000;
  c_permit        constant int := 5000;
  c_veteran       constant int := 15000;
  v_base int := 0; v_booths int; v_artists int; v_corners int; v_addons int := 0;
  el jsonb; v_qty int; v_kind text; v_term text; v_unit int;
begin
  if p_exhibitor_type = 'artist' then
    v_base := coalesce(p_artist_single, 0) * c_artist_single + coalesce(p_artist_double, 0) * c_artist_double;
  else
    v_base := coalesce(p_vendor_single, 0) * c_vendor_single + coalesce(p_vendor_double, 0) * c_vendor_double;
  end if;
  v_booths := coalesce(p_artist_single, 0) + coalesce(p_artist_double, 0) + coalesce(p_vendor_single, 0) + coalesce(p_vendor_double, 0);
  -- 088: permits are capped at the county rule, 2 artists per single (10x10)
  -- and 4 per double (getMaxArtists in src/lib/pricing.ts). Was 4 per booth.
  v_artists := case when p_exhibitor_type = 'artist'
                    then least(greatest(coalesce(p_artist_count, 0), 0),
                               greatest(0, coalesce(p_artist_single, 0)) * 2 + greatest(0, coalesce(p_artist_double, 0)) * 4)
                    else 0 end;
  v_corners := greatest(0, least(coalesce(p_corner_count, 0), v_booths));

  if p_add_ons is not null and jsonb_typeof(p_add_ons) = 'array' then
    for el in select * from jsonb_array_elements(p_add_ons) loop
      if jsonb_typeof(el) <> 'object' then continue; end if;
      v_qty := greatest(0, floor(coalesce((el->>'qty')::numeric, 0)))::int;
      if v_qty = 0 then continue; end if;
      v_kind := el->>'kind'; v_term := el->>'term';
      v_unit := case v_kind
        when 'extra_table'  then 5000
        when 'extra_chairs' then 5000
        when 'tattoo_bed'   then case v_term when 'daily' then 5000 when 'weekend' then 15000 else null end
        when 'arm_rest'     then case v_term when 'daily' then 4000 when 'weekend' then 8000 else null end
        when 'tattoo_light' then case v_term when 'daily' then 4000 when 'weekend' then 8000 else null end
        else null end;
      if v_unit is null then continue; end if;
      v_addons := v_addons + v_qty * v_unit;
    end loop;
  end if;

  return v_base + v_artists * c_permit + v_corners * c_corner + v_addons - (case when p_is_veteran then c_veteran else 0 end);
end $$;
revoke execute on function public.application_list_price(text,int,int,int,int,int,int,jsonb,boolean) from public, anon;
grant  execute on function public.application_list_price(text,int,int,int,int,int,int,jsonb,boolean) to authenticated, service_role;

revoke execute on function public.application_list_price(text,int,int,int,int,int,int,jsonb,boolean) from public, anon;
grant  execute on function public.application_list_price(text,int,int,int,int,int,int,jsonb,boolean) to authenticated, service_role;
comment on function public.application_list_price is
  'Mirror of src/lib/pricing.ts calculatePricing().total (088: permits capped at 2 per single, 4 per double). pricing-sql.test.ts runs it against pricing.ts on every npm test; verify_079_matrix.sql pins it live.';

-- ── 3. roster guard + verification protection ───────────────
create or replace function public.applications_roster_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_verifying boolean := coalesce(current_setting('aatc.artist_verify', true), '') = 'on';
  v_owner boolean := not (public.is_admin() or auth.uid() is null);
  v_out jsonb := '[]'::jsonb;
  e jsonb; o jsonb; v_match jsonb;
begin
  if new.artists is not null and jsonb_typeof(new.artists) = 'array' then
    -- No more artists than permits, for everyone.
    if jsonb_array_length(new.artists) > coalesce(new.artist_count, 0) then
      raise exception 'the roster has % artists but % permit(s); adding an artist goes through a request',
        jsonb_array_length(new.artists), coalesce(new.artist_count, 0) using errcode = 'check_violation';
    end if;

    -- Verification keys: only set_artist_id_verified() writes them.
    if not v_verifying then
      for e in select value from jsonb_array_elements(new.artists) loop
        if jsonb_typeof(e) <> 'object' then v_out := v_out || jsonb_build_array(e); continue; end if;
        v_match := null;
        if tg_op = 'UPDATE' and old.artists is not null and jsonb_typeof(old.artists) = 'array'
           and coalesce(e->>'id_url', '') <> '' then
          select value into v_match from jsonb_array_elements(old.artists) as x(value)
           where x.value->>'id_url' = e->>'id_url' and x.value ? 'id_verified_at' limit 1;
        end if;
        e := e - 'id_verified_at' - 'id_verified_by';
        if v_match is not null then
          e := e || jsonb_build_object('id_verified_at', v_match->'id_verified_at', 'id_verified_by', v_match->'id_verified_by');
        end if;
        v_out := v_out || jsonb_build_array(e);
      end loop;
      new.artists := v_out;
    end if;
  end if;

  -- An exhibitor cannot rename, re-ID or remove an artist AATC has verified.
  if tg_op = 'UPDATE' and v_owner and old.artists is not null and jsonb_typeof(old.artists) = 'array' then
    for o in select value from jsonb_array_elements(old.artists) loop
      if jsonb_typeof(o) = 'object' and o ? 'id_verified_at' then
        if new.artists is null or jsonb_typeof(new.artists) <> 'array' or not exists (
             select 1 from jsonb_array_elements(new.artists) as n(value)
              where n.value->>'id_url' = o->>'id_url'
                and coalesce(n.value->>'name', '') = coalesce(o->>'name', '')) then
          raise exception 'artist "%" has a verified ID and cannot be changed or removed here; contact AATC to change a verified artist',
            coalesce(o->>'name', '?') using errcode = 'check_violation';
        end if;
      end if;
    end loop;
  end if;

  return new;
end $$;

-- Runs after applications_protect_staff_columns_trg (alphabetical), so for an
-- owner new.artist_count is already the protected old value.
drop trigger if exists applications_roster_guard_trg on public.applications;
create trigger applications_roster_guard_trg
  before insert or update of artists, artist_count on public.applications
  for each row execute function public.applications_roster_guard();

revoke execute on function public.applications_roster_guard() from public, anon, authenticated;

-- ── 4. set_artist_id_verified: the only writer of verification ──
create or replace function public.set_artist_id_verified(p_application_id uuid, p_index int, p_verified boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_artists jsonb; v_el jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select artists into v_artists from public.applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if v_artists is null or jsonb_typeof(v_artists) <> 'array' or p_index < 0 or p_index >= jsonb_array_length(v_artists) then
    raise exception 'no artist % on this application', p_index + 1 using errcode = 'P0002';
  end if;
  v_el := v_artists -> p_index;
  if p_verified and coalesce(v_el->>'id_url', '') = '' then
    raise exception 'artist % has no ID uploaded', p_index + 1 using errcode = 'check_violation';
  end if;
  v_el := v_el - 'id_verified_at' - 'id_verified_by';
  if p_verified then
    v_el := v_el || jsonb_build_object('id_verified_at', to_jsonb(now()), 'id_verified_by', to_jsonb(auth.uid()));
  end if;
  perform set_config('aatc.artist_verify', 'on', true);
  update public.applications set artists = jsonb_set(v_artists, array[p_index::text], v_el) where id = p_application_id;
  perform set_config('aatc.artist_verify', '', true);
  return v_el;
end $$;

revoke execute on function public.set_artist_id_verified(uuid, int, boolean) from public, anon;
grant  execute on function public.set_artist_id_verified(uuid, int, boolean) to authenticated;

commit;
