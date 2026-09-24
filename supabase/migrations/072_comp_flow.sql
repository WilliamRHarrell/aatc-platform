-- ============================================================
-- Migration 072: comped booth applications.
-- Verification: supabase/verify/verify_072.sql
--
-- WHY. "Comp Booth" was a checkbox whose only effect was the invoice INSERT on
-- Approve, which only ran when no invoice existed. Approve, send back, comp,
-- approve therefore lost the comp silently (13c265d7, 2026-09-24). A comped
-- invoice (amount 0, status paid) also never received deposit_paid_at /
-- final_paid_at, which every "deposit paid" gate keys on: Assign Booth, the
-- public directory policy (032, has_paid_deposit) and the lifecycle sweep's
-- joins. So a correctly comped exhibitor was unassignable and invisible
-- (44c185e8, a real vendor).
--
-- POLICIES ENUMERATED BEFORE WRITING. applications: "applications: own read"
-- (001), "applications: own insert" (001), "applications: admin all" (001),
-- "applications: public read deposit-paid" (032, to anon+authenticated),
-- "applications: own update" (041). invoices: "invoices: admin all" (001),
-- "invoices: own read" (029, via owns_invoice). NOTHING HERE ADDS OR CHANGES A
-- POLICY. The two RPCs below are the only new write path; they are SECURITY
-- DEFINER, check is_admin() themselves, and are the only way to set comped_at
-- outside "admin all".
--
-- ONE FACT. Comped means applications.comped_at is not null. Money is on the
-- invoice. total_amount stays the list price; comp means "owes $0".
--
-- LIFECYCLE. Neither RPC touches applications.status. Approve / reject /
-- waitlist / pending stay in the drawer; expire / cancel stay in 035.
-- ============================================================
begin;

-- ── 1. Columns ───────────────────────────────────────────────
alter table public.applications
  add column if not exists comped_at timestamptz,
  add column if not exists comped_by uuid references public.profiles(id) on delete set null;

comment on column public.applications.comped_at is
  'Set by comp_application(); NULL = not comped. The one home of the fact. deposit_due_at / final_due_at are NULL while comped.';
comment on column public.applications.comped_by is
  'profiles.id of the admin who comped. NULL whenever comped_at is NULL.';

-- ── 2. Clamps (071 bodies + the two new columns) ─────────────
create or replace function public.applications_force_safe_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  -- 071: EVERY writer. A row nobody has seen cannot be verified.
  new.veteran_doc_verified_at := null;
  new.veteran_doc_verified_by := null;
  -- 072: EVERY writer. A comp is an admin action on an existing row, never a
  -- property of a new one.
  new.comped_at := null;
  new.comped_by := null;
  -- auth.uid() is null only for service_role / trusted server contexts; a real
  -- applicant always presents a JWT. Do not widen this further - the clamp is
  -- what stops an applicant self-approving (043).
  if public.is_admin() or auth.uid() is null then return new; end if;
  new.status := 'pending';
  new.needs_roster := coalesce(new.needs_roster, false);
  new.directory_override := false;
  new.approved_at := null;
  new.deposit_due_at := null;
  new.final_due_at := null;
  return new;
end $$;

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
    -- 071: an owner cannot verify their own document.
    new.veteran_doc_verified_at := old.veteran_doc_verified_at;
    new.veteran_doc_verified_by := old.veteran_doc_verified_by;
    -- 072: an owner cannot comp themselves.
    new.comped_at := old.comped_at;
    new.comped_by := old.comped_by;
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

  -- 071: EVERY writer. A replaced document is an unverified document.
  if new.veteran_id_url is distinct from old.veteran_id_url then
    new.veteran_doc_verified_at := null;
    new.veteran_doc_verified_by := null;
  end if;

  return new;
end $$;

-- ── 3. comp_application: one transaction across application + invoice ──
-- Settles the invoice: amount 0, status paid, paid_at + both milestones, so
-- Assign Booth, the directory policy and the sweep joins all read "paid".
-- Due dates are nulled: nothing is owed, so nothing is due. Idempotent.
-- Refused once any payment is recorded (same rule as uncomp): a comp on top
-- of a payment would leave amount_paid > amount and could never be undone.
-- Refund or reverse the payment in Invoices first.
create or replace function public.comp_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_inv uuid; v_count int; v_paid int;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform 1 from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  v_count := (select count(*) from public.invoices where application_id = p_application_id);
  if v_count > 1 then
    raise exception 'multiple invoices on this application - settle them in Invoices first' using errcode = 'P0001';
  end if;

  v_paid := (select coalesce(amount_paid, 0) from public.invoices where application_id = p_application_id);
  if v_paid > 0 then
    raise exception 'payments exist on this invoice - refund them in Invoices before comping' using errcode = 'P0001';
  end if;

  update public.applications
     set comped_at = coalesce(comped_at, now()),
         comped_by = coalesce(comped_by, auth.uid()),
         deposit_due_at = null,
         final_due_at = null
   where id = p_application_id;

  v_inv := (select id from public.invoices where application_id = p_application_id);
  if v_inv is null then
    insert into public.invoices (application_id, amount, amount_paid, status, paid_at, deposit_paid_at, final_paid_at)
    values (p_application_id, 0, 0, 'paid', now(), now(), now());
  else
    update public.invoices
       set amount = 0,
           status = 'paid',
           paid_at = coalesce(paid_at, now()),
           deposit_paid_at = coalesce(deposit_paid_at, now()),
           final_paid_at = coalesce(final_paid_at, now())
     where id = v_inv;
  end if;
end $$;

-- ── 4. uncomp_application: refused once any payment exists ───
-- Restores the invoice to the list price, pending, milestones cleared. Due
-- dates are the drawer's rule (deposit = later of approved_at + 30 d and
-- now + 14 d; final = the fixed date) and are restored there.
create or replace function public.uncomp_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_inv uuid; v_paid int; v_total int; v_count int;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_total := (select total_amount from public.applications where id = p_application_id for update);
  if v_total is null then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  v_count := (select count(*) from public.invoices where application_id = p_application_id);
  if v_count > 1 then
    raise exception 'multiple invoices on this application - settle them in Invoices first' using errcode = 'P0001';
  end if;
  v_inv := (select id from public.invoices where application_id = p_application_id);
  v_paid := (select coalesce(amount_paid, 0) from public.invoices where id = v_inv);
  if v_paid > 0 then
    raise exception 'payments exist on this invoice - the comp cannot be removed' using errcode = 'P0001';
  end if;

  update public.applications
     set comped_at = null, comped_by = null
   where id = p_application_id;

  if v_inv is not null then
    update public.invoices
       set amount = v_total,
           status = 'pending',
           paid_at = null,
           deposit_paid_at = null,
           final_paid_at = null
     where id = v_inv;
  end if;
end $$;

revoke all on function public.comp_application(uuid) from public;
revoke all on function public.uncomp_application(uuid) from public;
grant execute on function public.comp_application(uuid) to authenticated;
grant execute on function public.uncomp_application(uuid) to authenticated;

comment on function public.comp_application(uuid) is
  'Admin only (is_admin() inside). Refused (P0001) when amount_paid > 0 or more than one invoice. Sets comped_at/by, nulls due dates, settles the invoice to 0/paid with both milestones. Never touches status.';
comment on function public.uncomp_application(uuid) is
  'Admin only. Refused (P0001) when amount_paid > 0 or more than one invoice. Restores invoice to total_amount/pending with milestones cleared. Never touches status or due dates.';

commit;
