-- ============================================================
-- Migration 079: the database prices a booth application and refuses a
-- client total that disagrees; one ACTIVE application per user per event.
-- Verification: supabase/verify/verify_079.sql (+ verify_079_matrix.sql,
-- GENERATED from src/lib/pricing.ts by pricing-matrix.test.ts)
--
-- 1. PRICE. total_amount was whatever the browser sent (the apply forms send
--    calculatePricing().total; a direct PostgREST insert could send anything;
--    the 031/043 insert clamp never touched it). application_list_price()
--    mirrors src/lib/pricing.ts exactly - booth base by type, permit fees
--    clamped to 4 artists per booth, corners clamped to the booth count,
--    add-ons from the same price table, the veteran discount - and the insert
--    clamp REFUSES (not overwrites) a non-admin, non-service insert whose
--    total_amount differs, so a drift between the form and the function is
--    loud, never silent. ONE HOME stays pricing.ts: the vitest generates
--    verify_079_matrix.sql from calculatePricing() and fails if the committed
--    file is stale; verify_079 runs that matrix against this function.
--    Admins (the /admin/booths add form, which uses the same TS pricing) and
--    the service role (import-returning, grandfathered prior-year totals)
--    keep their totals - same exemption as every clamp since 043.
--    Live check 2026-09-25: both applications matched the function.
-- 2. ONE ACTIVE APPLICATION. Partial unique index on (user_id, event_id) for
--    status in (pending, approved, waitlisted). Rejected, expired and
--    canceled rows do not count, so a declined applicant can re-apply. The
--    forms check first and point to the portal; the index is the guarantee.
--
-- 3. QUANTITIES. No check constraint ever forbade a negative booth quantity
--    or corner count, and both pricing implementations summed the OTHER
--    exhibitor type's columns into the booth count, so an artist row with
--    vendor_single_qty = -1 zeroed its permit fees at an agreed total
--    (security review, 2026-09-25). Checks below; the clamp also refuses an
--    applicant insert with no booth at all.
-- 4. UPDATE. The 041/043 owner clamp restored total_amount and the booth
--    quantities but not add_ons or artist_count, so an owner could add paid
--    add-ons or artists after inserting at the bare price. Both are restored
--    for owners now. artist_count is what was PAID for; the roster panel's
--    write of it is ignored for owners (needs_roster and artists still land).
--
-- POLICIES: none touched. CLAMPS: applications_force_safe_insert() = 077
-- body + the price refusal + the booth-count refusal;
-- applications_protect_staff_columns() = 077 body + add_ons and artist_count
-- restored for owners.
-- ============================================================
begin;

-- ── 1. The price, in SQL ─────────────────────────────────────
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
  v_artists := case when p_exhibitor_type = 'artist' then least(greatest(coalesce(p_artist_count, 0), 0), greatest(0, v_booths * 4)) else 0 end;
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
comment on function public.application_list_price is
  'Mirror of src/lib/pricing.ts calculatePricing().total. verify_079_matrix.sql (generated from the TS) pins equality. Used by the insert clamp to refuse a client total.';

-- ── 1b. Quantities cannot be negative ────────────────────────
alter table public.applications drop constraint if exists applications_quantities_nonnegative;
alter table public.applications add constraint applications_quantities_nonnegative
  check (artist_single_qty >= 0 and artist_double_qty >= 0 and vendor_single_qty >= 0 and vendor_double_qty >= 0 and corner_count >= 0);

-- ── 2. Insert clamp: 077 body + the price refusal ───────────
create or replace function public.applications_force_safe_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_price int;
begin
  new.veteran_doc_verified_at := null;
  new.veteran_doc_verified_by := null;
  new.comped_at := null;
  new.comped_by := null;
  new.submission_receipt_sent_at := null;
  if public.is_admin() or auth.uid() is null then return new; end if;
  new.status := 'pending';
  new.needs_roster := coalesce(new.needs_roster, false);
  new.directory_override := false;
  new.approved_at := null;
  new.deposit_due_at := null;
  new.final_due_at := null;
  -- 079: an applicant must be buying at least one booth of their own type.
  if (case when new.exhibitor_type = 'artist' then new.artist_single_qty + new.artist_double_qty
           else new.vendor_single_qty + new.vendor_double_qty end) < 1 then
    raise exception 'an application needs at least one booth' using errcode = 'check_violation';
  end if;
  -- 079: the applicant's total must equal the list price. Refused, not
  -- corrected, so a form/function drift surfaces at once.
  v_price := public.application_list_price(new.exhibitor_type::text, new.artist_single_qty, new.artist_double_qty,
              new.vendor_single_qty, new.vendor_double_qty, new.corner_count, new.artist_count, new.add_ons, new.is_veteran);
  if new.total_amount is distinct from v_price then
    raise exception 'total_amount % does not match the list price % for this application', new.total_amount, v_price
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ── 2b. Update clamp: 077 body + priced inputs restored for owners ──
create or replace function public.applications_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare roster_ok boolean;
begin
  if not (public.is_admin() or auth.uid() is null) then
    new.status := old.status;  new.approved_at := old.approved_at;
    new.deposit_due_at := old.deposit_due_at;  new.final_due_at := old.final_due_at;
    new.total_amount := old.total_amount;  new.directory_override := old.directory_override;
    new.is_veteran := old.is_veteran;  new.corner_count := old.corner_count;
    new.artist_single_qty := old.artist_single_qty;  new.artist_double_qty := old.artist_double_qty;
    new.vendor_single_qty := old.vendor_single_qty;  new.vendor_double_qty := old.vendor_double_qty;
    new.user_id := old.user_id;  new.event_id := old.event_id;
    new.exhibitor_type := old.exhibitor_type;
    new.veteran_doc_verified_at := old.veteran_doc_verified_at;
    new.veteran_doc_verified_by := old.veteran_doc_verified_by;
    new.comped_at := old.comped_at;
    new.comped_by := old.comped_by;
    new.submission_receipt_sent_at := old.submission_receipt_sent_at;
    -- 079: the priced inputs an owner could still change.
    new.add_ons := old.add_ons;
    new.artist_count := old.artist_count;
    if old.needs_roster and not new.needs_roster then
      if old.exhibitor_type = 'artist' then
        roster_ok := new.artists is not null
          and jsonb_typeof(new.artists) = 'array'
          and jsonb_array_length(new.artists) > 0
          and not exists (select 1 from jsonb_array_elements(new.artists) e
                           where coalesce(e->>'id_url', '') = '');
      else
        roster_ok := coalesce(new.id_doc_url, '') <> '';
      end if;
      if not roster_ok then new.needs_roster := old.needs_roster; end if;
    elsif not old.needs_roster and new.needs_roster then
      new.needs_roster := old.needs_roster;
    end if;
  end if;

  if new.veteran_id_url is distinct from old.veteran_id_url then
    new.veteran_doc_verified_at := null;
    new.veteran_doc_verified_by := null;
  end if;

  return new;
end $$;

-- ── 3. One active application per user per event ────────────
create unique index if not exists applications_one_active_per_user_event
  on public.applications (user_id, event_id)
  where user_id is not null and status in ('pending', 'approved', 'waitlisted');
comment on index public.applications_one_active_per_user_event is
  'One live booth application per user per event (079). Rejected/expired/canceled rows do not count. The forms check first; this is the guarantee.';

commit;
