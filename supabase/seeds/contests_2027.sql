-- ============================================================
-- SEED: 2027 tattoo contest categories (49 rows)
--
-- Paste into the Supabase SQL editor. Not applied by anyone but Ryan.
-- Requires migration 052 (is_kids_category, active) and 053 (vote auth).
--
-- ── PROVENANCE ──────────────────────────────────────────────
-- Names are taken VERBATIM from batch-01 section 6.4, transcribed from the 2026
-- AATC East graphic that Ryan confirmed is the 2027 lineup. 49 categories,
-- Friday 13 / Saturday 20 / Sunday 16. Best Ear Curation is excluded: it
-- appears only in the 2025 program.
--
-- An earlier draft of this file derived the names from docs/site-copy-v1.md,
-- the 2025 program. The per-day counts matched exactly and it was still wrong
-- in 31 of 49 names - that document abbreviates ('Large Color' for 'Large Color
-- Tattoo') and, in two places, ORDERS THE PAIRS THE OTHER WAY ROUND. Counts
-- reconciling is not names reconciling.
--
-- ── event id ────────────────────────────────────────────────
-- Asserted, not assumed. b3630abd is an INACTIVE decoy kept as a rollback
-- anchor; rows seeded against it would be invisible on every surface while
-- looking correct in the table.
-- ============================================================

do $$
declare
  v_event   uuid := '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c';
  v_name    text;
  v_active  boolean;
  v_existing int;
begin
  select name, is_active into v_name, v_active
    from public.events where id = v_event;

  if v_name is null then
    raise exception 'ABORT: event % does not exist. Wrong database?', v_event;
  end if;
  if not v_active then
    raise exception 'ABORT: event % (%) is NOT the active event. Refusing to seed 49 contests against a decoy.', v_event, v_name;
  end if;

  select count(*) into v_existing from public.contests where event_id = v_event;
  if v_existing > 0 then
    raise exception 'ABORT: % contest row(s) already exist for %. This seed is written to run ONCE against an empty set - re-running would duplicate all 49. Clear them deliberately first if that is what you want.', v_existing, v_name;
  end if;

  raise notice 'Seeding 49 contests against % (%)', v_name, v_event;

  insert into public.contests (event_id, name, scheduled_time, "order", is_kids_category)
  select v_event, c.name, c.scheduled_time, c.ord, c.kids
  from (values
  ('Large Color Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 1, false),
  ('Small Color Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 2, false),
  ('Large Black & Gray Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 3, false),
  ('Small Black & Gray Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 4, false),
  ('Best Military Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 5, false),
  ('American Pride Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 6, false),
  ('Best Geometric / Dotwork', timestamptz '2027-04-16 16:00:00-04:00', 7, false),
  ('Best Asian Inspired Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 8, false),
  ('Best Hand Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 9, false),
  ('Best Neck / Face Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 10, false),
  ('Best Cover Up Tattoo', timestamptz '2027-04-16 16:00:00-04:00', 11, false),
  ('Tattoo of the Day B & G', timestamptz '2027-04-16 16:00:00-04:00', 12, false),
  ('Tattoo of the Day Color', timestamptz '2027-04-16 16:00:00-04:00', 13, false),
  ('Large Color Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 1, false),
  ('Small Color Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 2, false),
  ('Large Black & Gray Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 3, false),
  ('Small Black & Gray Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 4, false),
  ('Best Lettering Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 5, false),
  ('Best American Traditional', timestamptz '2027-04-17 16:00:00-04:00', 6, false),
  ('Best Neotraditional Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 7, false),
  ('Best Watercolor Tattoo', timestamptz '2027-04-17 16:00:00-04:00', 8, false),
  ('Best Small Color Portrait', timestamptz '2027-04-17 16:00:00-04:00', 9, false),
  ('Best Large Color Portrait', timestamptz '2027-04-17 16:00:00-04:00', 10, false),
  ('Small Black & Gray Portrait', timestamptz '2027-04-17 16:00:00-04:00', 11, false),
  ('Large Black & Gray Portrait', timestamptz '2027-04-17 16:00:00-04:00', 12, false),
  ('Best Back Piece', timestamptz '2027-04-17 16:00:00-04:00', 13, false),
  ('Best Arm Sleeve', timestamptz '2027-04-17 16:00:00-04:00', 14, false),
  ('Best Leg Sleeve', timestamptz '2027-04-17 16:00:00-04:00', 15, false),
  ('Best Chest Piece', timestamptz '2027-04-17 16:00:00-04:00', 16, false),
  ('Best Overall Male', timestamptz '2027-04-17 16:00:00-04:00', 17, false),
  ('Best Overall Female', timestamptz '2027-04-17 16:00:00-04:00', 18, false),
  ('Tattoo of the Day B & G', timestamptz '2027-04-17 16:00:00-04:00', 19, false),
  ('Tattoo of the Day Color', timestamptz '2027-04-17 16:00:00-04:00', 20, false),
  ('Large Color Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 1, false),
  ('Small Color Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 2, false),
  ('Large Black & Gray Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 3, false),
  ('Small Black & Gray Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 4, false),
  ('Best Tattoo by a Veteran', timestamptz '2027-04-18 16:00:00-04:00', 5, false),
  ('Best Comic/Superhero', timestamptz '2027-04-18 16:00:00-04:00', 6, false),
  ('Best Anime Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 7, false),
  ('Best Disney Themed Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 8, false),
  ('Most Unusual Tattoo', timestamptz '2027-04-18 16:00:00-04:00', 9, false),
  ('Best Tattooed Flesh (Fake Skin)', timestamptz '2027-04-18 16:00:00-04:00', 10, false),
  ('Best Original Flash', timestamptz '2027-04-18 16:00:00-04:00', 11, false),
  ('Best Temporary Tattoo (Kids)', timestamptz '2027-04-18 16:00:00-04:00', 12, true),
  ('Tattoo of the Day B & G', timestamptz '2027-04-18 16:00:00-04:00', 13, false),
  ('Tattoo of the Day Color', timestamptz '2027-04-18 16:00:00-04:00', 14, false),
  ('Best in Show B & G', timestamptz '2027-04-18 16:00:00-04:00', 15, false),
  ('Best in Show Color', timestamptz '2027-04-18 16:00:00-04:00', 16, false)
  ) as c(name, scheduled_time, ord, kids);

  raise notice 'Done. % rows inserted.', (select count(*) from public.contests where event_id = v_event);
end $$;

-- ── verify ──────────────────────────────────────────────────
-- want: 3 rows - Friday 13, Saturday 20, Sunday 16.
select to_char(scheduled_time at time zone 'America/New_York', 'Day') as day,
       count(*) as categories
  from public.contests
 where event_id = '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c'
 group by 1, date_trunc('day', scheduled_time at time zone 'America/New_York')
 order by min(scheduled_time);

-- want: exactly 1 row, Best Temporary Tattoo (Kids), Sunday.
select name, scheduled_time
  from public.contests
 where event_id = '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c'
   and is_kids_category
 order by name;

-- want: 0 rows. Ear curation must not be present.
select name from public.contests
 where event_id = '28a3ad3d-d843-4c7e-a80a-bf0a76b9ad0c'
   and name ilike '%ear%';
