-- Migration 093: food truck health permit and business license uploads (PR 3 of 3).
--
-- Ryan, 2026-10-07/08 (docs/superpowers/plans/2026-10-07-food-truck-application.md,
-- decision 8 and the PR 3 decisions): a truck may upload its health permit and
-- business license on the application form or later in the portal, into
-- PRIVATE storage, and an admin marks each one verified (like artist IDs, 088).
-- PDF, JPG or PNG, up to 10 MB. Retention follows the ID-documents open item.
--
-- WHY A NEW BUCKET: application-docs' owner policy keys the folder on the
-- uploader's account (071), and an applicant on the public form has none. Here
-- the folder is the truck id, like food-truck-logos (090): <truck id>/<file>.
-- Form uploads go through signed upload URLs issued by the server route.
--
-- This adds:
--   1. Bucket food-truck-docs: private, 10 MB, application/pdf, image/jpeg, image/png.
--   2. Storage policies: an owner INSERTs into their own truck's folder; an
--      admin INSERTs anywhere in it and READs it. Nobody else reads; there is
--      no UPDATE or DELETE policy (a new upload is a new file name).
--   3. food_trucks columns, per document (permit, license): *_path,
--      *_uploaded_at, *_verified_at, *_verified_by. A path must sit in the
--      truck's own folder (CHECK).
--   4. food_trucks_docs_guard (BEFORE INSERT OR UPDATE): a new or changed path
--      stamps *_uploaded_at and CLEARS the verification; the verified columns
--      change only through set_food_truck_doc_verified() (or a trusted server
--      context, auth.uid() null). Owners keep writing the path through their
--      existing "Vendors update own food_truck" policy.
--   5. set_food_truck_doc_verified(truck, 'permit'|'license', verified):
--      admin only, refuses to verify a document that was never uploaded.
--
-- Existing policies, enumerated before changing (replay of 001-092, `npm run
-- verify:local -- --dump-schema`, 2026-10-08):
--   food_trucks: "Vendors update own food_truck" UPDATE (user_id = auth.uid()),
--                "food_trucks: editorial write" ALL has_role(admin, content_editor),
--                "food_trucks: own read" SELECT (user_id = auth.uid()).
--   storage.objects: no policy mentions food-truck-docs (the bucket is new);
--                the food-truck-logos policies (017, 090) are unchanged.
-- Only the three food-truck-docs storage policies are added.

begin;

-- ── 1. the bucket ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-truck-docs', 'food-truck-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. storage policies ─────────────────────────────────────
drop policy if exists "food-truck-docs: owner insert" on storage.objects;
drop policy if exists "food-truck-docs: admin insert" on storage.objects;
drop policy if exists "food-truck-docs: admin read" on storage.objects;
create policy "food-truck-docs: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'food-truck-docs'
              and (storage.foldername(name))[1] in (select t.id::text from public.food_trucks t where t.user_id = auth.uid()));
create policy "food-truck-docs: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'food-truck-docs' and public.is_admin());
create policy "food-truck-docs: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'food-truck-docs' and public.is_admin());

-- ── 3. columns ──────────────────────────────────────────────
alter table public.food_trucks
  add column if not exists permit_path text,
  add column if not exists permit_uploaded_at timestamptz,
  add column if not exists permit_verified_at timestamptz,
  add column if not exists permit_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists license_path text,
  add column if not exists license_uploaded_at timestamptz,
  add column if not exists license_verified_at timestamptz,
  add column if not exists license_verified_by uuid references auth.users(id) on delete set null;
alter table public.food_trucks drop constraint if exists food_trucks_doc_paths_in_own_folder;
alter table public.food_trucks add constraint food_trucks_doc_paths_in_own_folder
  check ((permit_path is null or permit_path like id::text || '/%')
     and (license_path is null or license_path like id::text || '/%'));
comment on column public.food_trucks.permit_path is 'Health permit, in the private food-truck-docs bucket at <truck id>/... (093).';
comment on column public.food_trucks.license_path is 'Business license, in the private food-truck-docs bucket at <truck id>/... (093).';

-- ── 4. the guard ────────────────────────────────────────────
create or replace function public.food_trucks_docs_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
-- coalesce: an unset setting reads NULL, and "not NULL" would skip the revert below.
declare v_trusted boolean := auth.uid() is null or coalesce(current_setting('aatc.truck_doc_verify', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_trusted then
      new.permit_verified_at := null; new.permit_verified_by := null;
      new.license_verified_at := null; new.license_verified_by := null;
    end if;
    new.permit_uploaded_at  := case when new.permit_path  is null then null else coalesce(new.permit_uploaded_at, now()) end;
    new.license_uploaded_at := case when new.license_path is null then null else coalesce(new.license_uploaded_at, now()) end;
    return new;
  end if;

  if not v_trusted then
    new.permit_verified_at  := old.permit_verified_at;  new.permit_verified_by  := old.permit_verified_by;
    new.license_verified_at := old.license_verified_at; new.license_verified_by := old.license_verified_by;
    new.permit_uploaded_at  := old.permit_uploaded_at;  new.license_uploaded_at := old.license_uploaded_at;
  end if;
  -- A new document is a different document: stamp it and drop the old verification.
  if new.permit_path is distinct from old.permit_path then
    new.permit_uploaded_at := case when new.permit_path is null then null else now() end;
    new.permit_verified_at := null; new.permit_verified_by := null;
  end if;
  if new.license_path is distinct from old.license_path then
    new.license_uploaded_at := case when new.license_path is null then null else now() end;
    new.license_verified_at := null; new.license_verified_by := null;
  end if;
  return new;
end $$;
drop trigger if exists food_trucks_docs_guard_trg on public.food_trucks;
create trigger food_trucks_docs_guard_trg
  before insert or update on public.food_trucks
  for each row execute function public.food_trucks_docs_guard();
revoke execute on function public.food_trucks_docs_guard() from public, anon, authenticated;

-- ── 5. verification, admin only ─────────────────────────────
create or replace function public.set_food_truck_doc_verified(p_truck_id uuid, p_kind text, p_verified boolean)
returns timestamptz
language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_path text; v_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('permit', 'license') then
    raise exception 'unknown document %', p_kind using errcode = '22023';
  end if;
  select case p_kind when 'permit' then permit_path else license_path end
    into v_path from public.food_trucks where id = p_truck_id for update;
  if not found then raise exception 'food truck not found' using errcode = 'P0002'; end if;
  if p_verified and v_path is null then
    raise exception 'no % uploaded for this truck', p_kind using errcode = 'check_violation';
  end if;
  v_at := case when p_verified then now() else null end;
  perform set_config('aatc.truck_doc_verify', 'on', true);
  if p_kind = 'permit' then
    update public.food_trucks set permit_verified_at = v_at, permit_verified_by = case when p_verified then auth.uid() end where id = p_truck_id;
  else
    update public.food_trucks set license_verified_at = v_at, license_verified_by = case when p_verified then auth.uid() end where id = p_truck_id;
  end if;
  perform set_config('aatc.truck_doc_verify', '', true);
  return v_at;
end $$;
revoke execute on function public.set_food_truck_doc_verified(uuid, text, boolean) from public, anon;
grant  execute on function public.set_food_truck_doc_verified(uuid, text, boolean) to authenticated;

commit;
