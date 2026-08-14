-- Migration 048: portal profile self-edit — audit trail + logo upload path.
-- Verification: supabase/verify/verify_048.sql
--
-- WHAT IS ALREADY IN PLACE, AND WHY THERE IS NO NEW TABLE POLICY HERE.
-- The directory reads `applications` directly (not `exhibitors`), and migration
-- 041 already gave owners UPDATE on their own application. Its clamp protects
-- status, pricing, lifecycle, quantities and ownership — but NOT
-- business_name, website, instagram, phone, logo_url or facebook. So the write
-- path for self-edit is open already and needs nothing added. Verified against
-- the deployed function by verify_043 A/B.
--
-- Two things ARE missing, and this migration adds them.
begin;

-- ── 1. STORAGE: owners cannot upload their own logo ─────────
-- `exhibitor-media` has exactly three policies (public read, admin insert,
-- admin delete). There has never been an owner path — so an exhibitor
-- uploading a logo is denied, and so is the EXISTING sponsor logo upload in
-- /portal, which writes to this bucket as the signed-in sponsor. Same shape as
-- the four owner-policy faults in 043: nobody wrote the owner policy.
--
-- Scoped to `profiles/<user id>/…` so one exhibitor cannot overwrite another's
-- logo, and so it cannot touch `sponsors/` or `aatc-graphics`, which CUTOVER
-- §B says to keep.
create policy "exhibitor-media: own profile insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exhibitor-media'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Needed for upsert: replacing a logo is an UPDATE on an existing object.
create policy "exhibitor-media: own profile update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'exhibitor-media'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "exhibitor-media: own profile delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'exhibitor-media'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
  );


-- ── 2. AUDIT TRAIL ──────────────────────────────────────────
-- Self-edit publishes immediately with no approval queue, which is the right
-- tradeoff — a queue makes exhibitors wait on staff for their own Instagram
-- handle. The cost is that a directory listing can change without anyone
-- noticing, and `business_name` is also how staff FIND an exhibitor in
-- /admin/applications, on an invoice and on a booth assignment. This table is
-- what makes that reversible: not by blocking the edit, but by recording what
-- it was before.
create table profile_edits (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications on delete cascade,
  -- Denormalised deliberately, same reasoning as the booth history scope: the
  -- feed must stay readable after an application is deleted, and "who was this"
  -- is the first question when reading an old edit.
  business_name  text,
  field          text not null,
  old_value      text,
  new_value      text,
  edited_by      uuid,                  -- auth.uid(); null for service role
  by_owner       boolean not null,      -- false = staff edit
  edited_at      timestamptz not null default now()
);

create index profile_edits_recent_idx on profile_edits (edited_at desc);
create index profile_edits_application_idx on profile_edits (application_id, edited_at desc);

alter table profile_edits enable row level security;

-- Admin read only. Nothing writes through the API — the trigger below is
-- SECURITY DEFINER and is the only writer.
create policy "profile_edits: admin read"
  on profile_edits for select using (is_admin());

create or replace function public.log_profile_edit()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_owner boolean := (auth.uid() is not null and auth.uid() = new.user_id);
begin
  -- One row per changed field. Wider than a single jsonb blob, but it makes
  -- "what changed" a column rather than something the reader has to diff.
  if new.business_name is distinct from old.business_name then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'business_name', old.business_name, new.business_name, v_actor, v_owner);
  end if;
  if new.website is distinct from old.website then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'website', old.website, new.website, v_actor, v_owner);
  end if;
  if new.instagram is distinct from old.instagram then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'instagram', old.instagram, new.instagram, v_actor, v_owner);
  end if;
  if new.facebook is distinct from old.facebook then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'facebook', old.facebook, new.facebook, v_actor, v_owner);
  end if;
  if new.phone is distinct from old.phone then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'phone', old.phone, new.phone, v_actor, v_owner);
  end if;
  if new.logo_url is distinct from old.logo_url then
    insert into profile_edits (application_id, business_name, field, old_value, new_value, edited_by, by_owner)
    values (new.id, new.business_name, 'logo_url', old.logo_url, new.logo_url, v_actor, v_owner);
  end if;
  return null;  -- AFTER trigger; return value is ignored
end $$;

comment on function public.log_profile_edit is
  'Records directory-facing field changes on applications. AFTER UPDATE, so it never blocks or rewrites the edit — the BEFORE trigger from 041/043 has already clamped anything staff-controlled by the time this runs.';

-- AFTER, not BEFORE. The 041/043 clamp is a BEFORE UPDATE trigger that rewrites
-- NEW; running after it means this logs what was actually stored rather than
-- what was submitted and then discarded.
drop trigger if exists applications_log_profile_edit_trg on applications;
create trigger applications_log_profile_edit_trg
  after update on applications
  for each row execute function public.log_profile_edit();

commit;
