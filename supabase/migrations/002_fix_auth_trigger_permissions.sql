-- ============================================================
-- AATC Platform — Fix auth trigger permissions
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- Grant supabase_auth_admin the ability to call handle_new_user()
-- and write to the profiles table during the signup trigger.

grant usage on schema public to supabase_auth_admin;

grant execute on function handle_new_user() to supabase_auth_admin;

grant all on table public.profiles to supabase_auth_admin;

-- Also needed if the sequence is used (uuid via gen_random_uuid is fine,
-- but belt-and-suspenders for any future int PKs).
grant usage, select on all sequences in schema public to supabase_auth_admin;
