-- ============================================================
-- Tattoo Goo - correct the record to reflect an OPEN OFFER
--
-- They were offered Gold at the grandfathered $3,000 and have not responded.
-- The row says status = 'confirmed', which is wrong, and more exposed than it
-- looks:
--
--   The public read policy (migration 030) is `status = 'confirmed'`, full stop.
--   /sponsors queries event_id + status='confirmed' and NOTHING ELSE - no
--   placement flag is involved. So a confirmed sponsorship on the ACTIVE event
--   appears in the public sponsor directory immediately.
--
-- Tattoo Goo is currently invisible only because the row still sits on the
-- INACTIVE event. That is luck, not protection. Re-pointing it to the active
-- event while status='confirmed' would publish them as a 2027 sponsor the
-- moment the page revalidated - without anyone ticking featured_footer or
-- show_on_homepage.
--
-- Setting status='pending' removes them from the public policy's reach
-- entirely, so the re-point becomes safe to do whenever, and publication
-- becomes a separate deliberate act.
-- ============================================================

begin;

update sponsorships
   set status     = 'pending',
       notes      = coalesce(nullif(notes, '') || E'\n', '') ||
                    'Gold offered at grandfathered $3,000 (pre-13-Jul-2026 pricing). Awaiting response as of 2026-07-29. Release the slot if unanswered.',
       updated_at = now()
 where sponsor_name = 'Tattoo Goo'
   and status = 'confirmed';

do $$
declare v_status text; v_amount int; v_event_active boolean; v_footer boolean; v_home boolean;
begin
  select s.status, s.amount, e.is_active, s.featured_footer, s.show_on_homepage
    into v_status, v_amount, v_event_active, v_footer, v_home
    from sponsorships s
    join events e on e.id = s.event_id
   where s.sponsor_name = 'Tattoo Goo';

  if v_status is null then
    raise exception 'ABORT - Tattoo Goo row not found.';
  end if;
  if v_status <> 'pending' then
    raise exception 'FAILED - status is "%", expected pending. Rolled back.', v_status;
  end if;
  if v_amount <> 300000 then
    raise warning 'Tattoo Goo amount is % - expected 300000 ($3,000). Not changed by this script.', v_amount;
  end if;

  raise notice '';
  raise notice 'Tattoo Goo now: status=% amount=% on_active_event=% footer=% homepage=%',
    v_status, v_amount, v_event_active, v_footer, v_home;
  raise notice 'No longer reachable by the public read policy. Re-point is now safe to defer.';
  raise notice '';
end $$;

commit;


-- ════════════════════════════════════════════════════════════
-- HELD - run only when they ACCEPT. Three steps, in this order.
-- ════════════════════════════════════════════════════════════
/*
begin;

-- 1. Lock the grandfathered amount BEFORE confirming, so no admin edit in
--    between can reprice it to the current $5,000 Gold.
update sponsorships
   set amount_locked = true
 where sponsor_name = 'Tattoo Goo' and amount = 300000;

-- 2. Move to the active event and confirm. This alone publishes them to
--    /sponsors - the directory needs no placement flag.
update sponsorships
   set event_id = (select id from events where is_active = true),
       status   = 'confirmed',
       updated_at = now()
 where sponsor_name = 'Tattoo Goo';

-- 3. Optional placement, only if they are to appear on the homepage/footer too.
-- update sponsorships
--    set show_on_homepage = true, featured_footer = true, homepage_order = 1
--  where sponsor_name = 'Tattoo Goo';

do $$
declare v_locked boolean; v_status text; v_active boolean;
begin
  select s.amount_locked, s.status, e.is_active into v_locked, v_status, v_active
    from sponsorships s join events e on e.id = s.event_id
   where s.sponsor_name = 'Tattoo Goo';
  if not v_locked or v_status <> 'confirmed' or not v_active then
    raise exception 'FAILED - locked=% status=% active_event=%. Rolled back.', v_locked, v_status, v_active;
  end if;
  raise notice 'Tattoo Goo confirmed on the active event at a locked $3,000. Now public on /sponsors.';
end $$;
commit;
*/
