-- ============================================================
-- Migration 074: pinup capacity has ONE home; register_pinup_entry is
-- service-role only; the two direct anon intake inserts are closed; anon's
-- read of applications is limited to the directory columns.
-- Verification: supabase/verify/verify_074.sql (also the public grant audit)
--
-- 1. CAPACITY. register_pinup_entry() decided confirmed vs waitlist against
--    a p_capacity PARAMETER (default 25) and pinup_spots_remaining() did the
--    same, so any caller could name its own cap. The number was also written
--    in the admin page, the route's email and the public copy: six homes.
--    Now: events.pinup_capacity (> 0, default 25) is read inside both
--    functions; the parameter is gone; the function returns the capacity so
--    the route can quote it; every page reads the column.
--    Pending rows keep counting toward capacity (Ryan, 2026-09-24).
-- 2. GRANT. 051/052/055 granted register_pinup_entry to service_role only,
--    but Supabase's default privileges left anon and authenticated able to
--    execute it (probed live 2026-09-24: an anon call reached the function's
--    own validation). Combined with (1) that was a cap bypass that also
--    skipped the route's bot trap, open/closed gate and confirmation email.
--    verify_073's allow-list wrongly blessed it; corrected in that file.
-- 3. DIRECT INSERTS. POLICIES ENUMERATED BEFORE WRITING:
--      pinup_entries: "admins read pinup entries" SELECT, "admins write pinup
--        entries" UPDATE, "admins delete pinup entries" DELETE (051), "anon may
--        submit a pinup entry" INSERT to anon, authenticated with check
--        (status = 'pending' and age_confirmed = true) (051, re-created 055).
--      panel_registrations: "panel_registrations: admin all" ALL (016),
--        "panel_registrations: public insert" INSERT with check (true) (016).
--    Both intake routes (/api/pinup-entry, /api/panel-register) write with
--    the SERVICE ROLE, so neither INSERT policy is used by the app; each let
--    anon write rows that bypass the route's capacity and validation, and a
--    pending pinup row counts toward capacity. Both DROPPED. Nothing else on
--    either table changes.
-- 4. APPLICATIONS COLUMNS. "applications: public read deposit-paid" (032, to
--    anon + authenticated) exposes EVERY column of a directory-visible row:
--    email, contact_name, notes, total_amount, id_doc_url, user_id, comped_by.
--    Probed live 2026-09-24 with the anon key: 2 rows, all columns. The three
--    directory pages select a fixed column list and never `*`. Anon's
--    table-level SELECT is replaced with a column-level SELECT on exactly that
--    list plus the columns the policy expression reads. The policy itself is
--    unchanged. authenticated non-owners still see every column - that is
--    migration 075 (a column-limited view, the 038 pattern).
-- ============================================================
begin;

-- ── 1. Capacity column ───────────────────────────────────────
alter table public.events
  add column if not exists pinup_capacity integer not null default 25;
alter table public.events drop constraint if exists events_pinup_capacity_positive;
alter table public.events add constraint events_pinup_capacity_positive check (pinup_capacity > 0);
comment on column public.events.pinup_capacity is
  'Miss AATC Pinup Contest places. The ONE home of the number: read by register_pinup_entry(), pinup_spots_remaining(), /admin/pinup, /admin/events and the public page. Lowering it never removes an entry.';

-- ── 2. register_pinup_entry: capacity from the row, service_role only ──
drop function if exists public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean,boolean);
drop function if exists public.register_pinup_entry(uuid,text,text,text,text,text,text,int,boolean);
drop function if exists public.register_pinup_entry(uuid,text,text,text,text,text,text,int);

create or replace function public.register_pinup_entry(
  p_event_id         uuid,
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_stage_name       text default null,
  p_address          text default null,
  p_notes            text default null,
  p_marketing_opt_in boolean default false,
  p_likeness_release boolean default false
)
returns table (id uuid, status text, queue_position int, capacity int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_capacity int;
  v_taken int;
  v_status text;
  v_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0
     or p_email is null or length(trim(p_email)) = 0
     or p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'full_name, email and phone are required'
      using errcode = 'check_violation';
  end if;

  if p_likeness_release is not true then
    raise exception 'the likeness release is required to enter'
      using errcode = 'check_violation';
  end if;

  -- The cap comes from the event row and nowhere else.
  v_capacity := (select e.pinup_capacity from public.events e where e.id = p_event_id);
  if v_capacity is null then
    raise exception 'unknown event' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('pinup_entry:' || p_event_id::text));

  v_taken := (select count(*) from public.pinup_entries pe
               where pe.event_id = p_event_id
                 and pe.status in ('pending','confirmed'));

  v_status := case when v_taken < v_capacity then 'confirmed' else 'waitlist' end;

  insert into public.pinup_entries
    (event_id, full_name, stage_name, email, phone, address, notes, age_confirmed, status,
     marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source,
     likeness_release, likeness_release_at)
  values
    (p_event_id, trim(p_full_name), nullif(trim(coalesce(p_stage_name,'')),''),
     lower(trim(p_email)), trim(p_phone), nullif(trim(coalesce(p_address,'')),''),
     nullif(trim(coalesce(p_notes,'')),''), true, v_status,
     p_marketing_opt_in,
     case when p_marketing_opt_in then now() else null end,
     case when p_marketing_opt_in then 'pinup-entry' else null end,
     true, now())
  returning pinup_entries.id into v_id;

  return query select v_id, v_status, v_taken + 1, v_capacity;
end;
$$;

revoke execute on function public.register_pinup_entry(uuid,text,text,text,text,text,text,boolean,boolean) from public, anon, authenticated;
grant  execute on function public.register_pinup_entry(uuid,text,text,text,text,text,text,boolean,boolean) to service_role;

-- ── 3. pinup_spots_remaining: capacity from the row, still anon-callable ──
drop function if exists public.pinup_spots_remaining(uuid,int);
create or replace function public.pinup_spots_remaining(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select greatest(0, (select e.pinup_capacity from public.events e where e.id = p_event_id) - (
    select count(*)::int from public.pinup_entries pe
     where pe.event_id = p_event_id and pe.status in ('pending','confirmed')
  ));
$$;
revoke execute on function public.pinup_spots_remaining(uuid) from public;
grant  execute on function public.pinup_spots_remaining(uuid) to anon, authenticated, service_role;

-- ── 4. Direct anon intake inserts closed ─────────────────────
drop policy if exists "anon may submit a pinup entry" on public.pinup_entries;
drop policy if exists "panel_registrations: public insert" on public.panel_registrations;

-- ── 5. applications: anon reads directory columns only ───────
revoke select on table public.applications from anon;
grant select (
  id, event_id, status, needs_roster, directory_override,
  business_name, exhibitor_type, booth_size,
  artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count,
  instagram, website, facebook, phone, artists, tv_show, logo_url, portfolio_image_urls
) on table public.applications to anon;

commit;
