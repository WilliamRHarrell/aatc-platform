-- Migration 039: granular admin roles (part 1 of the role split).
-- Rationale + verification: supabase/verify/verify_039.sql
--
-- No begin/commit: ALTER TYPE ... ADD VALUE must not have its new value USED in
-- the same transaction. has_role() compares role::text, so it never references
-- the new literals and is safe alongside them.

alter type user_role add value if not exists 'content_editor';
alter type user_role add value if not exists 'sponsorship_manager';

create or replace function public.has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role::text = any(p_roles)
  );
$$;

revoke all on function public.has_role(text[]) from public;
grant execute on function public.has_role(text[]) to authenticated;

comment on function public.has_role(text[]) is
  'True when the caller holds any of the given roles. Pinned search_path, same rule as is_admin(). Compares role::text so new enum values need no function change.';
