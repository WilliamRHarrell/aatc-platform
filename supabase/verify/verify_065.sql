-- ============================================================
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. A failure RAISES
-- and aborts, so a clean finish IS a pass. Block Z is the only select, so it
-- is what the editor displays.
--
-- STYLE NOTE: variables use `v := (select ...)`, never `select ... into v`.
--
-- WRITES fixtures and removes them. Block D owns its own teardown.
--
-- THE POINT OF THIS FILE IS BLOCK D. Blocks A to C prove 065 changed nothing,
-- which is necessary but is NOT evidence that the dual-read works: on today's
-- data the new branch of the coalesce is never taken, so a migration that read
-- the credit wrongly, or not at all, would pass A to C exactly as a correct one
-- does. D is the only block that takes the new branch.
-- ============================================================

-- ── A. the precondition the no-op claim rests on ────────────
-- 065 is a provable no-op only while no confirmed credit item exists. If this
-- fails you are PAST step 2 - rows have been migrated into the table - and the
-- identical-render comparison in B and C no longer means anything.
do $$
declare
  v_items int;
begin
  v_items := (select count(*)
                from public.presentation_credit_items ci
                join public.presentation_credits c on c.id = ci.credit_id
               where c.status = 'confirmed');
  if v_items <> 0 then
    raise exception
      'A FAIL: % confirmed credit item(s) exist, so blocks B and C can no longer prove 065 changed nothing. Step 3 has begun.', v_items;
  end if;
  raise notice 'A PASS: no confirmed credit items, so the no-op claim is testable.';
end $$;


-- ── B. the indexes this view's correctness depends on ───────
-- The left joins added by 065 cannot fan one item into several rows ONLY
-- because an item can carry at most one credit. That is enforced by two
-- partial unique indexes from 060. If either is ever dropped, the views start
-- duplicating schedule rows silently.
do $$
begin
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'uq_credit_item_schedule') then
    raise exception 'B FAIL: uq_credit_item_schedule is missing. schedule_items_public can now duplicate rows.';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'uq_credit_item_panel') then
    raise exception 'B FAIL: uq_credit_item_panel is missing. panels_public can now duplicate rows.';
  end if;
  raise notice 'B PASS: both single-credit-per-item indexes present.';
end $$;


-- ── C. 065 changed nothing that renders ─────────────────────
-- Two properties, and the row counts are a positive control: a view returning
-- zero rows would satisfy the "identical" test vacuously.
do $$
declare
  v_view int; v_base int; v_diff int;
begin
  v_view := (select count(*) from public.schedule_items_public);
  v_base := (select count(*) from public.schedule_items where is_published);
  if v_view <> v_base or v_base = 0 then
    raise exception 'C FAIL: schedule_items_public returns % rows for % published items.', v_view, v_base;
  end if;

  -- Every presented_by still equals the PRE-065 expression, exactly.
  v_diff := (select count(*)
               from public.schedule_items_public v
               join public.schedule_items s on s.id = v.id
               left join public.sponsorships sp
                 on sp.id = s.presented_by_sponsorship_id and sp.status = 'confirmed'
              where v.presented_by is distinct from coalesce(sp.sponsor_name, s.presented_by_fallback));
  if v_diff <> 0 then
    raise exception 'C FAIL: % schedule row(s) render a different credit than before 065.', v_diff;
  end if;

  v_view := (select count(*) from public.panels_public);
  v_base := (select count(*) from public.panels where is_published);
  if v_view <> v_base or v_base = 0 then
    raise exception 'C FAIL: panels_public returns % rows for % published panels.', v_view, v_base;
  end if;

  v_diff := (select count(*)
               from public.panels_public v
               join public.panels p on p.id = v.id
               left join public.sponsorships sp
                 on sp.id = p.presented_by_sponsorship_id and sp.status = 'confirmed'
              where v.presented_by is distinct from coalesce(sp.sponsor_name, p.presented_by_fallback));
  if v_diff <> 0 then
    raise exception 'C FAIL: % panel row(s) render a different credit than before 065.', v_diff;
  end if;

  raise notice 'C PASS: both views return the same rows and the same credits as before 065.';
end $$;


-- ── D. the dual-read actually reads, and precedence holds ───
-- The block that takes the new branch. Three legs, in the order the precedence
-- is written: fallback alone, then credit over fallback, then sponsorship over
-- credit. Leg 1 is the positive control - without it, a view that ignored the
-- credit entirely would still pass leg 2 if the fallback happened to match.
--
-- The fixtures live and die inside this one DO block, so they are never
-- committed and never visible to a reader. show_on_sponsors is nevertheless set
-- FALSE explicitly: it defaults to TRUE (063), and a confirmed sponsorship is
-- publishable on /sponsors the moment it exists. Relying on transaction
-- isolation alone to keep a test row off a public page is not a margin worth
-- running.
do $$
declare
  v_event_id  uuid;
  v_item_id   uuid;
  v_credit_id uuid;
  v_sp_id     uuid;
  v_rendered  text;
  v_rows      int;
begin
  v_event_id := (select id from public.events where is_active);

  insert into public.schedule_items
         (event_id, day_date, start_time, title, presented_by_fallback, is_published)
       values (v_event_id, date '2027-04-16', time '23:59',
               'verify_065 fixture item', 'verify_065 fallback', true)
    returning id into v_item_id;

  -- Leg 1: fallback alone still renders. If this fails the migration broke the
  -- OLD path, which C could not have caught for a row that did not exist.
  v_rendered := (select presented_by from public.schedule_items_public where id = v_item_id);
  if v_rendered is distinct from 'verify_065 fallback' then
    raise exception 'D FAIL leg 1: fallback alone rendered %, expected the fallback.', coalesce(v_rendered, 'NULL');
  end if;

  -- Leg 2: a confirmed credit OUTRANKS the fallback. This is the whole point
  -- of migration 065 and nothing in today's data exercises it.
  insert into public.presentation_credits (event_id, buyer_name, status)
       values (v_event_id, 'verify_065 buyer', 'confirmed')
    returning id into v_credit_id;

  insert into public.presentation_credit_items (credit_id, schedule_item_id)
       values (v_credit_id, v_item_id);

  v_rendered := (select presented_by from public.schedule_items_public where id = v_item_id);
  if v_rendered is distinct from 'verify_065 buyer' then
    raise exception 'D FAIL leg 2: with a confirmed credit the row rendered %, expected the buyer name.', coalesce(v_rendered, 'NULL');
  end if;

  -- Still exactly one row. The unique index asserted in B is what makes this
  -- hold; checking it here proves the join, not just the index.
  v_rows := (select count(*) from public.schedule_items_public where id = v_item_id);
  if v_rows <> 1 then
    raise exception 'D FAIL leg 2: the credit join fanned one item into % rows.', v_rows;
  end if;

  -- Leg 2b, THE BOUNDARY: an UNCONFIRMED credit must NOT publish. Same gate as
  -- an unconfirmed sponsorship - confirming is the sole publish gate, and this
  -- table must not become a second back door.
  update public.presentation_credits set status = 'pending' where id = v_credit_id;
  v_rendered := (select presented_by from public.schedule_items_public where id = v_item_id);
  if v_rendered is distinct from 'verify_065 fallback' then
    raise exception 'D FAIL leg 2b: a PENDING credit rendered %, expected the fallback.', coalesce(v_rendered, 'NULL');
  end if;
  update public.presentation_credits set status = 'confirmed' where id = v_credit_id;

  -- Leg 3: a confirmed SPONSORSHIP outranks the credit. This is the decision
  -- recorded in 065's header: the sponsorship is the only source carrying a
  -- website, so the name must come from it whenever it exists, or the rendered
  -- name and the rendered link could belong to different companies.
  insert into public.sponsorships
         (event_id, sponsor_name, tier, status, website, show_on_sponsors)
       values (v_event_id, 'verify_065 sponsor', 'bronze', 'confirmed',
               'https://example.invalid', false)
    returning id into v_sp_id;

  update public.schedule_items set presented_by_sponsorship_id = v_sp_id where id = v_item_id;

  v_rendered := (select presented_by from public.schedule_items_public where id = v_item_id);
  if v_rendered is distinct from 'verify_065 sponsor' then
    raise exception 'D FAIL leg 3: with both a sponsorship and a credit the row rendered %, expected the sponsor name.', coalesce(v_rendered, 'NULL');
  end if;

  -- And the link travels with the name, which is the reason for the ordering.
  if (select presented_by_linked from public.schedule_items_public where id = v_item_id) is not true then
    raise exception 'D FAIL leg 3: the sponsorship won the name but presented_by_linked is not true.';
  end if;

  -- Teardown, with the last leg that needs the fixtures, and it ASSERTS.
  delete from public.presentation_credit_items where credit_id = v_credit_id;
  delete from public.presentation_credits where id = v_credit_id;
  delete from public.schedule_items where id = v_item_id;
  delete from public.sponsorships where id = v_sp_id;

  if exists (select 1 from public.schedule_items where title = 'verify_065 fixture item')
     or exists (select 1 from public.presentation_credits where buyer_name = 'verify_065 buyer')
     or exists (select 1 from public.sponsorships where sponsor_name = 'verify_065 sponsor') then
    raise exception 'D FAIL: fixtures survived cleanup.';
  end if;

  raise notice 'D PASS: fallback, credit over fallback, pending credit refused, sponsorship over credit. Fixtures removed.';
end $$;


-- ── E. the column SHAPE of both views, pinned ───────────────
-- ADDED AFTER 065 FAILED WITH 42P16. Nothing in blocks A to D looks at a
-- view's column list. They assert row counts, presented_by resolution and the
-- indexes the join relies on - all of which a view can satisfy perfectly while
-- a column has quietly vanished from it. A `create or replace` that drops a
-- column is refused by Postgres, but a DROP + CREATE is not, and 047 is a
-- drop-and-create sitting unapplied in this repo with a stale view body.
--
-- The failure that would have gone unnoticed: panels_public rebuilt without
-- panel_day. Blocks A to D all still pass. /events/schedule then selects a
-- column that no longer exists, PostgREST errors, and the page degrades to
-- empty through its own error handling - the seminars silently absent again,
-- which is precisely the defect 064 was written to repair.
--
-- These lists were read from the live database. If a column is added to either
-- view ON PURPOSE, update the expected string here in the same migration.
do $$
declare
  v_actual text;
  v_expect text;
begin
  v_expect := 'id,event_id,day_date,start_time,sort_order,title,location,note,'
              || 'kind,presented_by,presented_by_website,presented_by_logo_url,'
              || 'presented_by_linked';
  v_actual := (select string_agg(column_name, ',' order by ordinal_position)
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'schedule_items_public');
  if v_actual is distinct from v_expect then
    raise exception E'E FAIL: schedule_items_public shape changed.\n  expected: %\n  actual:   %',
      v_expect, coalesce(v_actual, 'VIEW MISSING');
  end if;

  -- 046's shape: the deprecated pair still present, the real date and time
  -- APPENDED LAST. This is what the live database has, because 047 is held.
  -- When 047 is finally applied this string must change to match it, and the
  -- credit join must be carried into 047's body at the same time.
  v_expect := 'id,event_id,title,description,panel_date,panel_time,location,'
              || 'panelists,is_free,cost,signup_type,max_capacity,image_url,'
              || 'host_email,presented_by,presented_by_website,'
              || 'presented_by_logo_url,presented_by_linked,panel_day,panel_start';
  v_actual := (select string_agg(column_name, ',' order by ordinal_position)
                 from information_schema.columns
                where table_schema = 'public' and table_name = 'panels_public');
  if v_actual is distinct from v_expect then
    raise exception E'E FAIL: panels_public shape changed.\n  expected: %\n  actual:   %',
      v_expect, coalesce(v_actual, 'VIEW MISSING');
  end if;

  raise notice 'E PASS: both view column lists match the live shape, in order.';
end $$;


-- ── Z. what the editor displays ─────────────────────────────
-- The step 3 reconciliation: every rendered credit and the source it resolves
-- from. want today: 4 rows, every one source = 'fallback'. Drive 'fallback' to
-- zero before dropping presented_by_fallback.
select 'schedule_items' as tbl, s.title,
       coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) as credit,
       case when sp.sponsor_name is not null then 'sponsorship'
            when c.buyer_name    is not null then 'credit'
            else 'fallback' end as source
  from public.schedule_items s
  left join public.sponsorships sp
    on sp.id = s.presented_by_sponsorship_id and sp.status = 'confirmed'
  left join public.presentation_credit_items ci on ci.schedule_item_id = s.id
  left join public.presentation_credits c on c.id = ci.credit_id and c.status = 'confirmed'
 where coalesce(sp.sponsor_name, c.buyer_name, s.presented_by_fallback) is not null
union all
select 'panels', p.title,
       coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback),
       case when sp.sponsor_name is not null then 'sponsorship'
            when c.buyer_name    is not null then 'credit'
            else 'fallback' end
  from public.panels p
  left join public.sponsorships sp
    on sp.id = p.presented_by_sponsorship_id and sp.status = 'confirmed'
  left join public.presentation_credit_items ci on ci.panel_id = p.id
  left join public.presentation_credits c on c.id = ci.credit_id and c.status = 'confirmed'
 where coalesce(sp.sponsor_name, c.buyer_name, p.presented_by_fallback) is not null;
