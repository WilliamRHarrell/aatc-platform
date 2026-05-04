-- ============================================================
-- Migration 021: Multi-booth per-size quantities + add-ons JSONB
-- Run after migration 020. Run in Supabase: Dashboard → SQL Editor → New query.
-- ============================================================

-- Per-size quantity columns. Default 0; existing 2026 rows stay at 0
-- and are interpreted via the legacy `booth_size` column.
alter table applications
  add column if not exists artist_single_qty int not null default 0,
  add column if not exists artist_double_qty int not null default 0,
  add column if not exists vendor_single_qty int not null default 0,
  add column if not exists vendor_double_qty int not null default 0;

-- Number of booths that should be assigned a corner. The legacy is_corner
-- boolean stays put (used by 2026 rows); 2027 records use corner_count.
alter table applications
  add column if not exists corner_count int not null default 0;

-- Add-ons stored as JSONB array of {kind, term, qty} objects.
-- Example: [{"kind":"tattoo_bed","term":"weekend","qty":1},{"kind":"extra_table","term":null,"qty":2}]
alter table applications
  add column if not exists add_ons jsonb not null default '[]'::jsonb;

-- Make legacy booth_size nullable so 2027 rows don't have to populate it.
-- 2026 rows still have it set; 2027 rows leave it null and use the qty columns.
-- The existing `total_amount` column continues to hold the booked total in cents
-- for both 2026 (single-booth) and 2027 (multi-booth) rows — no new column needed.
alter table applications alter column booth_size drop not null;
