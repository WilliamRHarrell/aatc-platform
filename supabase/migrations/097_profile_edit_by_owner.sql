-- ============================================================
-- Migration 097: profile_edits.by_owner is never NULL.
-- Verification: supabase/verify/verify_097.sql
--
-- BUG (Ryan, 2026-10-09, editor PR 3 test): saving an application that has
-- NO ACCOUNT (user_id null: admin-made, in person, an import before Invite &
-- link) failed whenever a logged field changed (business_name, website,
-- instagram, facebook, phone, logo_url):
--   null value in column "by_owner" of relation "profile_edits" violates
--   not-null constraint
-- 048's log_profile_edit() computed
--   v_owner := (auth.uid() is not null and auth.uid() = new.user_id)
-- With new.user_id null the comparison is NULL, and true AND NULL is NULL.
-- The AFTER UPDATE trigger's insert then failed, rolling back the whole
-- UPDATE. Not a service-role issue: service role (auth.uid() null) gave
-- false; a signed-in admin on an unlinked row gave NULL.
--
-- FIX: by_owner = coalesce(auth.uid() = new.user_id, false). It means "the
-- signed-in user owns this application"; with no owner it is a staff edit.
-- Same body otherwise (048).
--
-- Not silent before: the UPDATE failed and PostgREST returned the error, so
-- every caller showed it (guardedWrite, the editor route). Production read
-- 2026-10-09: 2 applications have no account (both ZZ test rows).
--
-- POLICIES ENUMERATED BEFORE WRITING: profile_edits has one, "profile_edits:
-- admin read" (048, SELECT, is_admin()); the trigger function is SECURITY
-- DEFINER and the only writer. No policy is changed.
-- ============================================================
begin;

create or replace function public.log_profile_edit()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  -- 097: never NULL. No owner (user_id null) or no signed-in user = staff edit.
  v_owner boolean := coalesce(auth.uid() = new.user_id, false);
begin
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
  'Records directory-facing field changes on applications (048). by_owner = the signed-in user owns the row, else false (097: never NULL, so an unlinked row can be edited). AFTER UPDATE, so it never rewrites the edit.';

commit;
