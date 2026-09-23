-- ============================================================
-- SCAN (no writes): the wrong contact domain must appear nowhere in the database.
--
-- A3, 2026-09-23. /events/tattoo-panels carried
-- info@armoredarmadillotattooconvention.com; the code now reads CONTACT_EMAIL
-- (src/lib/event-config.ts). A read-only sweep of every readable table found
-- ZERO database hits, so there is nothing to update - this file exists so the
-- claim is checked against the live database, every text-bearing column, by
-- the person applying the fix, and fails loudly if a hit ever appears.
--
-- Paste into the Supabase SQL editor. Read the MESSAGES pane.
-- want: one NOTICE "PASS". A FAIL lists table.column(rows) - report them and
-- a guarded update will be written for exactly those columns.
-- ============================================================

do $$
declare r record; n int; v_hits text := '';
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'jsonb', 'json')
     order by c.table_name, c.column_name
  loop
    execute format('select count(*) from public.%I where %I::text ilike %L', r.table_name, r.column_name, '%armoredarmadillo%')
       into n;
    if n > 0 then
      v_hits := v_hits || format(' %s.%s(%s)', r.table_name, r.column_name, n);
    end if;
  end loop;
  if v_hits <> '' then
    raise exception 'FAIL: "armoredarmadillo" found in:% - report these; nothing was changed.', v_hits;
  end if;
  raise notice 'PASS: no column in public carries "armoredarmadillo"';
end $$;
