-- Migration 089: split comp into "Comp booth" and "Comp permits"; permit
-- submission date on the event; comped booths count as secured.
--
-- Ryan, 2026-10-02/03:
--   - "Comp booth" waives booth fees but still charges artist permit fees;
--     "Comp permits" waives the permit fees too. Each is set separately.
--   - A booth-comped application that still owes permits follows the normal
--     billing rules (deposit minimum, final date), gets reminders, and is
--     NEVER expired or cancelled by the sweep (app side, lifecycle-sweep).
--   - Comp booth counts as secured for Assign Booth (app side), the public
--     directory and Submit Graphics (here and graphics-eligibility.ts).
--   - events.permit_submission_date: artist changes are free through the day
--     before it (Feb 28, 11:59 PM Eastern) and cost a $50 permit from it.
--
-- applications.comped_at keeps its column and now means COMP BOOTH; it is
-- what every existing reader already treats as "comped". New:
-- permits_comped_at / permits_comped_by.
--
-- MONEY: no invoice changes. Mapping (read 2026-10-03), regardless of status
-- (Pinback is pending; Jane Ink is being sent back to pending):
--   comped artist rows (Jane Ink)        -> also permits comped   ($0 stays $0)
--   comped vendor rows (Skin Reserve,
--                       Pinback)        -> booth comped only      ($0 stays $0;
--                                          vendors have no permits)
--   Chop Shop Tattoo (c6cfee7f)          -> booth comped, permits charged
--                                          ($200 stays $200, only if the
--                                          invoice still reads $200.00 unpaid)
--
-- Also: the public view strips artists[].id_verified_at / id_verified_by
-- (088) as well as id_url. 088 put the verifying admin's user id on each
-- verified artist and the view would have published it (no artist was
-- verified yet when this was written).
--
-- Policies are NOT changed. 072's comp_application / uncomp_application stay
-- as wrappers (comp everything / nothing), so the deployed drawer keeps working
-- between applying this and merging the app change. APPLY BEFORE MERGING.

begin;

-- ── 1. columns ──────────────────────────────────────────────
alter table public.applications
  add column if not exists permits_comped_at timestamptz,
  add column if not exists permits_comped_by uuid references public.profiles(id) on delete set null;

comment on column public.applications.comped_at is
  'COMP BOOTH (089; was "comped" in 072): booth fees waived. Set by set_comp(). Artist permit fees are still charged unless permits_comped_at is also set.';
comment on column public.applications.permits_comped_at is
  'COMP PERMITS (089): artist permit fees waived. Set by set_comp(). Added-artist permits follow this unless waived per request.';

alter table public.events
  add column if not exists permit_submission_date date;
comment on column public.events.permit_submission_date is
  'The day AATC submits artist permits to the county. Artist additions and swaps are free through the day before (11:59 PM America/New_York) and cost a new permit from this day; the replaced artist''s fee is forfeited (Ryan, 2026-10-02).';
update public.events set permit_submission_date = date '2027-03-01'
 where name = 'All American Tattoo Convention 2027' and permit_submission_date is null;

-- ── 2. only staff set comps (a separate trigger; 079's clamp is not copied) ──
create or replace function public.applications_protect_comp_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.permits_comped_at := null; new.permits_comped_by := null;
  else
    new.permits_comped_at := old.permits_comped_at; new.permits_comped_by := old.permits_comped_by;
  end if;
  return new;
end $$;
drop trigger if exists applications_protect_comp_columns_trg on public.applications;
create trigger applications_protect_comp_columns_trg
  before insert or update on public.applications
  for each row execute function public.applications_protect_comp_columns();
revoke execute on function public.applications_protect_comp_columns() from public, anon, authenticated;

-- ── 3. what a comp leaves on the invoice ────────────────────
-- Permit fees = the list price minus the same list price with no artists, so
-- the permit rule (fee, 2-per-single / 4-per-double cap) has one home:
-- application_list_price (088), mirrored by pricing.ts.
create or replace function public.application_permit_fees(p_application_id uuid)
returns int language sql stable security definer
set search_path = public, pg_catalog as $$
  select case when a.exhibitor_type = 'artist' then
           public.application_list_price(a.exhibitor_type::text, a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty, a.corner_count, a.artist_count, a.add_ons, a.is_veteran)
         - public.application_list_price(a.exhibitor_type::text, a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty, a.corner_count, 0, a.add_ons, a.is_veteran)
         else 0 end
    from public.applications a where a.id = p_application_id;
$$;
revoke execute on function public.application_permit_fees(uuid) from public, anon;
grant  execute on function public.application_permit_fees(uuid) to authenticated, service_role;

-- ── 4. set_comp: both flags and the invoice, one transaction ──
-- Invoice = (booth comped ? 0 : total_amount - permit fees) + (permits comped ? 0 : permit fees).
-- Refused once anything is paid, or with more than one invoice (072's rules).
-- A $0 result settles the invoice and clears the due dates (072's comp); a
-- positive result leaves it pending with no milestones; due dates for a
-- positive balance are the drawer's rule and are set there.
create or replace function public.set_comp(p_application_id uuid, p_booth boolean, p_permits boolean)
returns int
language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_app record; v_inv record; v_count int; v_permits int; v_amount int;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id, total_amount, comped_at, permits_comped_at into v_app
    from public.applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  v_count := (select count(*) from public.invoices where application_id = p_application_id);
  if v_count > 1 then
    raise exception 'multiple invoices on this application - settle them in Invoices first' using errcode = 'P0001';
  end if;
  select id, amount, coalesce(amount_paid, 0) as paid into v_inv
    from public.invoices where application_id = p_application_id for update;
  if v_inv.id is not null and v_inv.paid > 0 then
    raise exception 'payments exist on this invoice - change the comp in Invoices instead' using errcode = 'P0001';
  end if;

  v_permits := coalesce(public.application_permit_fees(p_application_id), 0);
  v_amount := (case when p_booth then 0 else greatest(0, v_app.total_amount - v_permits) end)
            + (case when p_permits then 0 else v_permits end);

  update public.applications
     set comped_at         = case when p_booth then coalesce(comped_at, now()) else null end,
         comped_by         = case when p_booth then coalesce(comped_by, auth.uid()) else null end,
         permits_comped_at = case when p_permits then coalesce(permits_comped_at, now()) else null end,
         permits_comped_by = case when p_permits then coalesce(permits_comped_by, auth.uid()) else null end,
         deposit_due_at    = case when v_amount = 0 then null else deposit_due_at end,
         final_due_at      = case when v_amount = 0 then null else final_due_at end
   where id = p_application_id;

  if v_inv.id is null then
    if v_amount = 0 then
      insert into public.invoices (application_id, amount, amount_paid, status, paid_at, deposit_paid_at, final_paid_at)
      values (p_application_id, 0, 0, 'paid', now(), now(), now());
    end if;
    -- A positive balance with no invoice yet: Approve creates it.
  elsif v_amount = 0 then
    update public.invoices
       set amount = 0, status = 'paid',
           paid_at = coalesce(paid_at, now()), deposit_paid_at = coalesce(deposit_paid_at, now()), final_paid_at = coalesce(final_paid_at, now())
     where id = v_inv.id;
  else
    update public.invoices
       set amount = v_amount, status = 'pending', paid_at = null, deposit_paid_at = null, final_paid_at = null
     where id = v_inv.id;
  end if;
  return v_amount;
end $$;
revoke execute on function public.set_comp(uuid, boolean, boolean) from public, anon;
grant  execute on function public.set_comp(uuid, boolean, boolean) to authenticated;

-- 072's names, kept as wrappers so the deployed drawer works until the app ships.
create or replace function public.comp_application(p_application_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_catalog as $$
begin perform public.set_comp(p_application_id, true, true); end $$;
create or replace function public.uncomp_application(p_application_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_catalog as $$
begin perform public.set_comp(p_application_id, false, false); end $$;
revoke execute on function public.comp_application(uuid) from public, anon;
grant  execute on function public.comp_application(uuid) to authenticated;
revoke execute on function public.uncomp_application(uuid) from public, anon;
grant  execute on function public.uncomp_application(uuid) to authenticated;

-- ── 5. comped booth = secured for the public directory ──────
create or replace view public.applications_public with (security_invoker = false, security_barrier = true) as
select a.id, a.event_id, a.status, a.exhibitor_type, a.business_name, a.booth_size,
       a.artist_single_qty, a.artist_double_qty, a.vendor_single_qty, a.vendor_double_qty,
       a.corner_count, a.artist_count,
       a.instagram, a.website, a.facebook, a.phone,
       -- artists is owner-editable (portal) and not shape-constrained, so a
       -- non-array or a non-object element must not error the whole view.
       -- 089: verification keys (088) are private like id_url.
       case when jsonb_typeof(a.artists) = 'array'
            then (select jsonb_agg(case when jsonb_typeof(el) = 'object' then el - 'id_url' - 'id_verified_at' - 'id_verified_by' else el end)
                    from jsonb_array_elements(a.artists) el)
            else null
       end as artists,
       a.tv_show, a.logo_url, a.portfolio_image_urls
  from public.applications a
 where a.status = 'approved'
   and a.needs_roster = false
   and (public.has_paid_deposit(a.id) or a.directory_override = true or a.comped_at is not null);

create or replace function public.booth_publicly_visible(p_application_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.applications a
     where a.id = p_application_id
       and a.status = 'approved'
       and a.needs_roster = false
       and (a.directory_override = true
            or a.comped_at is not null
            or exists (select 1 from public.invoices i where i.application_id = a.id and i.deposit_paid_at is not null))
  );
$$;

-- Anon keeps EXECUTE: the public booth policy (042) calls this as anon.
revoke all on function public.booth_publicly_visible(uuid) from public;
grant  execute on function public.booth_publicly_visible(uuid) to anon, authenticated;

-- ── 6. map the existing comps (no invoice changes) ──────────
update public.applications
   set permits_comped_at = comped_at, permits_comped_by = comped_by
 where comped_at is not null and permits_comped_at is null and exhibitor_type = 'artist';

do $$
declare n int;
begin
  -- Chop Shop: booth comped by agreement, the four permits charged ($200).
  update public.applications a
     set comped_at = coalesce(a.comped_at, now())
   where a.id = 'c6cfee7f-0cdf-45d6-abaf-897dd2ed3f67'
     and a.comped_at is null
     and exists (select 1 from public.invoices i
                  where i.application_id = a.id and i.amount = 20000 and coalesce(i.amount_paid, 0) = 0 and i.status = 'pending')
     and (select count(*) from public.invoices i where i.application_id = a.id) = 1;
  get diagnostics n = row_count;
  if n = 0 then
    raise notice '089: Chop Shop not mapped (already booth-comped, or its invoice no longer reads $200.00 unpaid). Set it in the drawer.';
  end if;
end $$;

commit;
