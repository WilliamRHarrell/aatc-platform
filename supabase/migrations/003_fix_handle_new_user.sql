-- ============================================================
-- AATC Platform — Robust handle_new_user trigger function
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- Drop and recreate with explicit search_path (required for security
-- definer functions in Supabase) and ON CONFLICT DO NOTHING to
-- prevent duplicate-key errors on retries.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Re-grant in case ownership changed
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_new_user() to postgres;

-- Ensure the trigger still points at the function
-- (drop + recreate is the safest way)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
