-- ============================================================
-- Migration 077: applications.submission_receipt_sent_at - the one fact that
-- says "the booth applicant got their receipt". Verification: verify_077.sql
--
-- WHY. Booth applications are inserted from the browser as the signed-in
-- applicant (no route), so the receipt email is sent by
-- POST /api/application-submitted, which the form calls after its insert.
-- That route must send ONCE per application, and the applicant must not be
-- able to un-mark it and trigger more mail. The column is set by the route
-- with the service role (compare-and-set: where it is still NULL) and is
-- clamped for owners in both clamp functions, like every other staff column.
--
-- POLICIES: none touched. CLAMPS (072 bodies + one line each):
--   applications_force_safe_insert()      nulls it on every INSERT
--   applications_protect_staff_columns()  restores OLD for owners on UPDATE
-- ============================================================
begin;

alter table public.applications
  add column if not exists submission_receipt_sent_at timestamptz;
comment on column public.applications.submission_receipt_sent_at is
  'Set once by /api/application-submitted (service role, compare-and-set) when the applicant receipt and the internal notice were sent. NULL = not sent. Owners cannot write it.';

create or replace function public.applications_force_safe_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  new.veteran_doc_verified_at := null;
  new.veteran_doc_verified_by := null;
  new.comped_at := null;
  new.comped_by := null;
  -- 077: a receipt cannot have been sent for a row that does not exist yet.
  new.submission_receipt_sent_at := null;
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
    new.veteran_doc_verified_at := old.veteran_doc_verified_at;
    new.veteran_doc_verified_by := old.veteran_doc_verified_by;
    new.comped_at := old.comped_at;
    new.comped_by := old.comped_by;
    -- 077: an owner cannot reset the receipt mark.
    new.submission_receipt_sent_at := old.submission_receipt_sent_at;
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

commit;
