-- Migration 041: owner UPDATE on applications + staff-column clamp.
-- Rationale + verification: supabase/verify/verify_041.sql
begin;

create policy "applications: own update"
  on applications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.applications_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare roster_ok boolean;
begin
  if public.is_admin() then return new; end if;

  -- Staff-controlled: pricing, lifecycle, gating, ownership.
  new.status := old.status;  new.approved_at := old.approved_at;
  new.deposit_due_at := old.deposit_due_at;  new.final_due_at := old.final_due_at;
  new.total_amount := old.total_amount;  new.directory_override := old.directory_override;
  new.is_veteran := old.is_veteran;  new.corner_count := old.corner_count;
  new.artist_single_qty := old.artist_single_qty;  new.artist_double_qty := old.artist_double_qty;
  new.vendor_single_qty := old.vendor_single_qty;  new.vendor_double_qty := old.vendor_double_qty;
  new.user_id := old.user_id;  new.event_id := old.event_id;
  new.exhibitor_type := old.exhibitor_type;

  -- needs_roster is NOT clamped: roster completion is an owner action and is
  -- half the directory gate. Instead the rule is enforced — an owner may only
  -- flip it false when the roster is genuinely complete.
  if old.needs_roster and not new.needs_roster then
    if old.exhibitor_type = 'artist' then
      roster_ok := new.artists is not null
        and jsonb_typeof(new.artists) = 'array'
        and jsonb_array_length(new.artists) > 0
        and not exists (
          select 1 from jsonb_array_elements(new.artists) e
           where coalesce(e->>'id_url', '') = ''
        );
    else
      roster_ok := coalesce(new.id_doc_url, '') <> '';
    end if;
    if not roster_ok then new.needs_roster := old.needs_roster; end if;
  elsif not old.needs_roster and new.needs_roster then
    new.needs_roster := old.needs_roster;  -- owners cannot re-open it
  end if;

  return new;
end $$;

drop trigger if exists applications_protect_staff_columns_trg on applications;
create trigger applications_protect_staff_columns_trg
  before update on applications
  for each row execute function public.applications_protect_staff_columns();

commit;
