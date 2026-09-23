-- ============================================================
-- DATA CHANGE for migration 070: venues, after-party rows, logo slots.
--
-- Run AFTER 070_after_parties_venues_contest_sponsor.sql. Every value below
-- is Ryan's (2026-09-23); fields he marked null stay null.
--
-- What this does, in one transaction:
--   1. Renames the three existing page_images uploads to venue-logo slots so
--      nothing is re-uploaded, and sets each alt to "[Venue name] logo"
--      (the old alt strings are dropped, not moved).
--   2. Recreates the three old night slugs empty, as optional night flyers.
--   3. Inserts the three venues (logo_slot -> the renamed slugs).
--   4. Inserts four after_party rows: Thursday published at 18:00; Friday,
--      Saturday and Sunday unpublished with no time (Ryan sets and publishes).
--      The title never carries the venue name; the venue comes from venue_id.
--      `location` holds the venue name only so the programme's plain text
--      column reads sensibly on /events/schedule and /tickets.
--
-- Guards: aborts unless each old slug exists exactly once WITH an image,
-- no venue slugs exist yet, and no after_party or Thursday rows exist.
-- ============================================================

do $$
declare
  v_event uuid;
  v_uptowns uuid; v_group uuid; v_luna uuid;
  n int;
begin
  v_event := (select id from public.events where is_active limit 1);
  if v_event is null then raise exception 'ABORT: no active event'; end if;

  -- ── guards ───────────────────────────────────────────────
  if (select count(*) from public.venues) <> 0 then
    raise exception 'ABORT: venues already has rows - this seed expects an empty table.';
  end if;
  if exists (select 1 from public.schedule_items where event_id = v_event and (kind = 'after_party' or day_date = date '2027-04-15')) then
    raise exception 'ABORT: after_party or Thursday rows already exist on the active event.';
  end if;
  n := (select count(*) from public.page_images where slug in ('after-party-thursday','after-party-friday','after-party-saturday') and image_path is not null);
  if n <> 3 then
    raise exception 'ABORT: expected the 3 night slots to each hold an upload, found %.', n;
  end if;
  if exists (select 1 from public.page_images where slug like 'venue-%') then
    raise exception 'ABORT: venue-* slugs already exist.';
  end if;

  -- ── 1. rename the uploads into venue slots, alt "[Venue] logo" ──
  update public.page_images set slug = 'venue-uptowns',       alt = 'Uptown''s Chicken & Waffles logo'      where slug = 'after-party-thursday';
  update public.page_images set slug = 'venue-group-therapy', alt = 'Group Therapy Pub & Playground logo'   where slug = 'after-party-friday';
  update public.page_images set slug = 'venue-club-luna',     alt = 'Club Luna logo'                        where slug = 'after-party-saturday';

  -- ── 2. the night flyer slots, empty ─────────────────────
  insert into public.page_images (slug) values
    ('after-party-thursday'), ('after-party-friday'), ('after-party-saturday'), ('after-party-sunday')
  on conflict (slug) do nothing;

  -- ── 3. venues ────────────────────────────────────────────
  insert into public.venues (event_id, name, slug, blurb, address, phone, website_url, instagram_url, instagram_label, facebook_url, tiktok_url, logo_slot)
  values
    (v_event, 'Uptown''s Chicken & Waffles', 'uptowns',
     'Fayetteville''s soul food favorite, led by Chef Judy Cage and co-founder RaShawn Moore. Known for chicken & waffles, shrimp & grits and fried green tomatoes, with a full bar and a stage for live entertainment.',
     '1707 Owen Dr, Fayetteville, NC 28304', '(910) 676-8039',
     'https://uptownsfay.com', 'https://www.instagram.com/uptownsfay/', null,
     'https://www.facebook.com/UptownsFay', null, 'venue-uptowns'),
    (v_event, 'Group Therapy Pub & Playground', 'group-therapy',
     'Fayetteville''s indoor pub and playground: 18 holes of wacky mini golf, axe throwing, duckpin bowling, a golf simulator, digital darts and karaoke, plus a 36-tap self-serve beer wall, craft cocktails and a full food menu.',
     '1906 Skibo Rd, Suite B, Fayetteville, NC 28314', '(910) 222-7574',
     'https://www.grouptherapy.fun/fayetteville/', 'https://www.instagram.com/grouptherapy.fun.fay/', null,
     'https://www.facebook.com/grouptherapy.fayetteville.fun', null, 'venue-group-therapy'),
    (v_event, 'Club Luna', 'club-luna',
     'Downtown Fayetteville''s newest dance club and event venue, with Faye''s Rooftop Bar, upstairs in Dad Bod District in the historic Kress building on Hay Street.',
     null, null,
     null, null, null,
     'https://www.facebook.com/profile.php?id=61583615182532', null, 'venue-club-luna');

  v_uptowns := (select id from public.venues where slug = 'uptowns');
  v_group   := (select id from public.venues where slug = 'group-therapy');
  v_luna    := (select id from public.venues where slug = 'club-luna');

  -- ── 4. the four after_party rows ─────────────────────────
  insert into public.schedule_items (event_id, day_date, start_time, sort_order, title, location, note, kind, venue_id, is_published)
  values
    (v_event, date '2027-04-15', time '18:00', 0, 'After Party',   'Uptown''s Chicken & Waffles',     'Live karaoke', 'after_party', v_uptowns, true),
    (v_event, date '2027-04-16', null,         0, 'After Party',   'Group Therapy Pub & Playground',  '',             'after_party', v_group,   false),
    (v_event, date '2027-04-17', null,         0, 'After Party',   'Club Luna',                       '',             'after_party', v_luna,    false),
    (v_event, date '2027-04-18', null,         0, 'Sunday Brunch', 'Uptown''s Chicken & Waffles',     '',             'after_party', v_uptowns, false);

  n := (select count(*) from public.schedule_items where event_id = v_event and kind = 'after_party');
  if n <> 4 then raise exception 'ABORT: expected 4 after_party rows, found %', n; end if;
  n := (select count(*) from public.schedule_items_public where event_id = v_event and kind = 'after_party');
  if n <> 1 then raise exception 'ABORT: expected exactly 1 PUBLISHED after_party row (Thursday), the public view shows %', n; end if;

  raise notice 'PASS: 3 venues, 3 logo slots renamed, 4 night slots, 4 after_party rows (1 published: Thursday 18:00)';
end $$;

-- want: 3 rows
select slug, name, address is not null as has_address, logo_slot from public.venues order by slug;
-- want: 4 rows, only Thursday published with a time
select day_date, start_time, is_published, title, location from public.schedule_items
 where kind = 'after_party' order by day_date;
-- want: venue-* slots filled, after-party-* slots empty
select slug, image_path is not null as filled, alt from public.page_images
 where slug like 'venue-%' or slug like 'after-party-%' order by slug;
