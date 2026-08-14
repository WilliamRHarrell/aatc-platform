-- Migration 043: exempt service_role from the clamp triggers; restore two owner
-- read/write paths. Rationale: supabase/verify/verify_043.sql
begin;

-- 1. service_role is NOT exempt from a trigger the way it is from RLS. Both
--    clamp functions test is_admin(), which is false for service_role (no
--    auth.uid()), so they fire against it. Confirmed: a service-role insert
--    with deposit_due_at set returns it NULL, which silently breaks
--    /api/admin/import-returning.
create or replace function public.applications_force_safe_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  -- auth.uid() is null only for service_role / trusted server contexts; a real
  -- applicant always presents a JWT. Do not widen this further — the clamp is
  -- what stops an applicant self-approving.
  if public.is_admin() or auth.uid() is null then return new; end if;
  new.status := 'pending';
  new.needs_roster := coalesce(new.needs_roster, false);
  new.directory_override := false;
  new.approved_at := null;
  new.deposit_due_at := null;
  new.final_due_at := null;
  return new;
end $$;

-- 2. Same exemption on the update clamp.
create or replace function public.applications_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare roster_ok boolean;
begin
  if public.is_admin() or auth.uid() is null then return new; end if;
  new.status := old.status;  new.approved_at := old.approved_at;
  new.deposit_due_at := old.deposit_due_at;  new.final_due_at := old.final_due_at;
  new.total_amount := old.total_amount;  new.directory_override := old.directory_override;
  new.is_veteran := old.is_veteran;  new.corner_count := old.corner_count;
  new.artist_single_qty := old.artist_single_qty;  new.artist_double_qty := old.artist_double_qty;
  new.vendor_single_qty := old.vendor_single_qty;  new.vendor_double_qty := old.vendor_double_qty;
  new.user_id := old.user_id;  new.event_id := old.event_id;
  new.exhibitor_type := old.exhibitor_type;
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
  return new;
end $$;

-- 3. REGRESSION FROM 038. Dropping "Public read published food_trucks" removed
--    the only SELECT path a food-truck vendor had to their own row — 017 gave
--    them UPDATE but never SELECT, so the public policy was carrying it. That
--    breaks the /portal food-truck panel and the food_truck branch of
--    /api/create-checkout. Public reads now go through food_trucks_public.
create policy "food_trucks: own read"
  on food_trucks for select to authenticated
  using (user_id = auth.uid());

-- 4. PRE-EXISTING, not caused by 038. exhibitors has only "public read" (now
--    dropped) and "admin write" — there has never been an owner INSERT policy,
--    so RosterCompletionPanel's exhibitor row creation has always been denied
--    for non-admins. Scoped to the caller's own application.
create policy "exhibitors: own insert"
  on exhibitors for insert to authenticated
  with check (
    exists (select 1 from applications a
             where a.id = exhibitors.application_id and a.user_id = auth.uid())
  );

create policy "exhibitors: own read"
  on exhibitors for select to authenticated
  using (
    exists (select 1 from applications a
             where a.id = exhibitors.application_id and a.user_id = auth.uid())
  );

-- 5. REGRESSION FROM 042 — booths. Dropping 001's `booths: public read using
--    (true)` left only the deposit-gated public policy, so an exhibitor who is
--    approved but has not yet paid cannot see their OWN booth assignment in
--    /portal — which is precisely the person the portal exists to serve. The
--    blanket policy was silently carrying owner reads here too.
create policy "booths: own read"
  on booths for select to authenticated
  using (
    application_id is not null
    and exists (select 1 from applications a
                 where a.id = booths.application_id and a.user_id = auth.uid())
  );

commit;
