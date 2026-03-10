-- ============================================================
-- AATC Platform — Migration 006: Per-artist info on applications
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- artists: JSON array of { name: text, id_url: text | null }
alter table applications
  add column if not exists artists           jsonb,
  add column if not exists artists_ids_later boolean not null default false;
