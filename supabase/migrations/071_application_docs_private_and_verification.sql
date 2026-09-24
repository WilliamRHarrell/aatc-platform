-- ============================================================
-- Migration 071: application-docs is PRIVATE and admin-only; veteran document
-- verification.
-- Verification: supabase/verify/verify_071.sql
--
-- POLICIES ENUMERATED BEFORE WRITING (storage.objects, bucket application-docs,
-- all from 004; no later migration touched this bucket):
--   "application-docs: authenticated upload"  INSERT to authenticated
--       with check (bucket_id = 'application-docs')
--       UNSCOPED: any signed-in user could write into any folder, including
--       another user's folder and admin/. DROPPED, replaced by the two scoped
--       inserts below.
--   "application-docs: own read"  SELECT to authenticated,
--       (storage.foldername(name))[1] = auth.uid()::text
--       DROPPED (Ryan, D4, 2026-09-24). No applicant-facing code reads a file
--       back: /portal shows presence only; the drawer, the booth page and the
--       booth packet are admin surfaces and now sign through the admin route.
--   "application-docs: admin read"  SELECT to authenticated using is_admin()
--       KEPT. Re-created verbatim so this file pins its body.
-- No anon policy exists and storage.buckets.public = false for this bucket
-- (verified live 2026-09-24 through the Storage API), so public read was
-- already impossible. Nobody holds UPDATE or DELETE; retention deletes will
-- use the service role (HANDOFF, retention plan).
--
-- WHO READS: only role = 'admin' (src/lib/roles.ts, D1). content_editor and
-- sponsorship_manager are excluded on purpose; is_admin() is exactly that test.
--
-- VERIFICATION is two columns on applications and ONE fact: verified means
-- veteran_doc_verified_at is not null. There is no boolean twin. Both columns
-- are clamped for owners (041/043 shape; service role and admins exempt), and
-- BOTH are cleared for EVERY writer when veteran_id_url changes: a replaced
-- document is an unverified document. The reset lives INSIDE the clamp
-- function, after the owner clamp. A separate BEFORE trigger sorted ahead of
-- the clamp would reset and then have the clamp restore OLD over it, letting
-- an owner's document swap keep the old verification.
-- ============================================================
begin;

-- ── 1. Storage policies ──────────────────────────────────────
drop policy if exists "application-docs: authenticated upload" on storage.objects;
drop policy if exists "application-docs: own read" on storage.objects;
drop policy if exists "application-docs: admin read" on storage.objects;

create policy "application-docs: own folder insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The booth detail admin page uploads replacement artist IDs under
-- admin/<application id>/ (src/app/admin/booths/[id]/page.tsx).
create policy "application-docs: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'application-docs' and public.is_admin());

create policy "application-docs: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'application-docs' and public.is_admin());

-- ── 2. Verification columns ──────────────────────────────────
alter table public.applications
  add column if not exists veteran_doc_verified_at timestamptz,
  add column if not exists veteran_doc_verified_by uuid
    references public.profiles(id) on delete set null;

comment on column public.applications.veteran_doc_verified_at is
  'Set by an admin in /admin/applications after viewing the veteran document. NULL = not verified. Cleared by applications_protect_staff_columns() whenever veteran_id_url changes.';
comment on column public.applications.veteran_doc_verified_by is
  'profiles.id of the admin who verified. NULL whenever veteran_doc_verified_at is NULL.';

-- ── 3. Clamp (043 body) + verification clamp + reset on document change ──
create or replace function public.applications_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare roster_ok boolean;
begin
  -- auth.uid() is null only for service_role / trusted server contexts (043).
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

  -- 071: EVERY writer, admins and the service role included. A replaced
  -- document is an unverified document.
  if new.veteran_id_url is distinct from old.veteran_id_url then
    new.veteran_doc_verified_at := null;
    new.veteran_doc_verified_by := null;
  end if;

  return new;
end $$;

-- The trigger applications_protect_staff_columns_trg (041) already calls this
-- function; the body is replaced in place. Nothing else to rebind.

commit;
