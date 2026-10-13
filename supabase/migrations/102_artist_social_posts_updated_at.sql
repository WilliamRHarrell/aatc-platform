-- ============================================================
-- Migration 102: updated_at on artist_social_posts.
-- Verification: supabase/verify/verify_102.sql
--
-- The admin page (Section 4) marks a row stuck when status = 'sending' and
-- nothing has touched it for 15 minutes. 101 shipped the table without a
-- timestamp that moves on every write; this adds the house-standard
-- updated_at + handle_updated_at trigger (001), which n8n's outcome write,
-- a skip and a re-send all bump.
--
-- POLICIES ENUMERATED BEFORE WRITING: artist_social_posts keeps its two
-- policies (admin read, admin update); nothing here touches policies.
-- ============================================================
begin;

alter table public.artist_social_posts
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists artist_social_posts_updated_at on public.artist_social_posts;
create trigger artist_social_posts_updated_at
  before update on public.artist_social_posts
  for each row execute function public.handle_updated_at();

comment on column public.artist_social_posts.updated_at is
  'Bumped on every write (102). status = sending with updated_at older than 15 minutes shows as stuck in admin.';

commit;
