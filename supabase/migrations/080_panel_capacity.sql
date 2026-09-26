-- ============================================================
-- Migration 080: panel capacity is enforced where a seat is a claim.
-- Verification: supabase/verify/verify_080.sql (then re-run verify_073:
-- its anon allow-list gains panel_seats_remaining)
--
-- DECIDED 2026-09-26 (Ryan), amending CUTOVER "Panel capacity - NOT
-- enforced": free seminars stay ungated by default (a planning target), but
--   1. a PAID panel (signup_type aatc_invoice) with max_capacity is capped:
--      a paid seat is a claim, and overselling is a refund;
--   2. any panel can be HARD-CAPPED (panels.hard_cap), which enforces
--      max_capacity on free registration too - for a limited physical
--      resource (Tooth Gem: 50 starter kits). Full means refused, not
--      waitlisted.
--
-- THE RACE. Counting in the route and inserting after is two statements; two
-- people can both read cap-1 and both succeed. register_panel_seat() locks
-- the panel row FOR UPDATE, counts and inserts in one transaction, so
-- concurrent registrations for the same panel serialise on that lock.
--
-- SEAT HOLDS. A paid registration is inserted 'pending' before Stripe
-- Checkout, with hold_expires_at; the route creates the Checkout session to
-- expire BEFORE the hold does. A pending row counts while its hold is live, so
-- an abandoned checkout frees its seat on its own. 'paid' (webhook) and 'na'
-- (free) always count. A seat counts by ONE rule, in panel_seats_taken();
-- the other two functions call it.
--
-- POLICIES ENUMERATED BEFORE WRITING (live names per 016/054/074/075):
--   panels: "panels: editorial write" (054), "panels: public read" (016).
--   panel_registrations: "panel_registrations: admin all" (075); the anon
--   "public insert" was dropped by 074, so the route (service role) is the
--   only public writer. None is changed here.
-- GRANTS: register_panel_seat service_role only; panel_seats_taken
-- authenticated (the admin page) + service_role; panel_seats_remaining anon
-- too (the public page shows "N left" / "Full" for enforced panels only).
-- ============================================================
begin;

-- ── 1. Columns and their constraints ──────────────────────────
alter table public.panels add column if not exists hard_cap boolean not null default false;
comment on column public.panels.hard_cap is
  'Enforce max_capacity on free registration too (080). Paid panels are always capped when max_capacity is set; free panels without hard_cap are not (planning target, CUTOVER).';
alter table public.panels drop constraint if exists panels_hard_cap_needs_capacity;
alter table public.panels add constraint panels_hard_cap_needs_capacity
  check (not hard_cap or max_capacity is not null);
alter table public.panels drop constraint if exists panels_max_capacity_positive;
alter table public.panels add constraint panels_max_capacity_positive
  check (max_capacity is null or max_capacity > 0);

alter table public.panel_registrations add column if not exists hold_expires_at timestamptz;
comment on column public.panel_registrations.hold_expires_at is
  'A pending (unpaid) registration holds its seat until this time (080). Set by register_panel_seat(); the Stripe Checkout session expires first.';

-- ── 2. The one counting rule ─────────────────────────────────
create or replace function public.panel_seats_taken(p_panel_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select count(*)::int from public.panel_registrations r
   where r.panel_id = p_panel_id
     and (r.payment_status in ('na', 'paid')
          or (r.payment_status = 'pending' and r.hold_expires_at > now()));
$$;
revoke execute on function public.panel_seats_taken(uuid) from public, anon;
grant  execute on function public.panel_seats_taken(uuid) to authenticated, service_role;

-- ── 3. Seats left, for enforced panels only (NULL = not enforced) ──
create or replace function public.panel_seats_remaining(p_panel_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
           when p.max_capacity is not null and (p.signup_type = 'aatc_invoice' or p.hard_cap)
             then greatest(0, p.max_capacity - public.panel_seats_taken(p.id))
         end
    from public.panels p
   where p.id = p_panel_id and p.is_published;
$$;
revoke execute on function public.panel_seats_remaining(uuid) from public;
grant  execute on function public.panel_seats_remaining(uuid) to anon, authenticated, service_role;

-- ── 4. Register: lock, count, insert. Returns NULL when full. ──
create or replace function public.register_panel_seat(
  p_panel_id            uuid,
  p_name                text,
  p_email               text,
  p_phone               text default null,
  p_social_media        text default null,
  p_attendee_type       text default 'patron',
  p_hold_minutes        int  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_panel public.panels%rowtype;
  v_status text;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'name and email are required' using errcode = 'check_violation';
  end if;

  select * into v_panel from public.panels where id = p_panel_id and is_published for update;
  if not found then
    raise exception 'panel not found' using errcode = 'P0002';
  end if;

  if v_panel.signup_type = 'free_registration' then
    v_status := 'na';
  elsif v_panel.signup_type = 'aatc_invoice' then
    if p_hold_minutes is null or p_hold_minutes < 30 or p_hold_minutes > 1440 then
      raise exception 'a paid registration needs a seat hold of 30 to 1440 minutes' using errcode = 'check_violation';
    end if;
    v_status := 'pending';
  else
    raise exception 'registration is not available for this panel' using errcode = 'check_violation';
  end if;

  if v_panel.max_capacity is not null
     and (v_panel.signup_type = 'aatc_invoice' or v_panel.hard_cap)
     and public.panel_seats_taken(v_panel.id) >= v_panel.max_capacity then
    return null;
  end if;

  insert into public.panel_registrations
    (panel_id, name, email, phone, social_media, attendee_type, payment_status, hold_expires_at)
  values
    (v_panel.id, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
     nullif(trim(coalesce(p_social_media, '')), ''), coalesce(nullif(p_attendee_type, ''), 'patron')::panel_attendee_type,
     v_status,
     case when v_status = 'pending' then now() + make_interval(mins => p_hold_minutes) end)
  returning id into v_id;

  return v_id;
end $$;
revoke execute on function public.register_panel_seat(uuid, text, text, text, text, text, int) from public, anon, authenticated;
grant  execute on function public.register_panel_seat(uuid, text, text, text, text, text, int) to service_role;
comment on function public.register_panel_seat is
  'The only public registration path (via /api/panel-register, service role). Locks the panel row, applies the cap when enforced (paid, or hard_cap), inserts. NULL = full.';

commit;
