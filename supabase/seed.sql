-- ============================================================
-- AATC Platform — Seed Data
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── AATC Fayetteville 2027 event ─────────────────────────────
insert into events (
  name,
  venue,
  city,
  state,
  start_date,
  end_date,
  registration_open_date,
  is_active
) values (
  'AATC Fayetteville 2027',
  'Crown Complex Event Center',
  'Fayetteville',
  'NC',
  '2027-04-16',
  '2027-04-18',
  '2026-04-19',
  true
);

-- ── Make a user admin (replace with your actual email) ────────
-- Run this after you sign up so your account becomes admin:
--
-- update profiles
-- set role = 'admin'
-- where email = 'your@email.com';
--
