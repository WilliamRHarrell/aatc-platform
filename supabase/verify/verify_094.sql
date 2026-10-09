-- ============================================================
-- HOW TO RUN: after 094 is applied, paste the whole file. Read the MESSAGES
-- pane; a failure RAISES. The last query (block C) shows the counts.
-- Read-only: no fixtures are written.
-- ============================================================

-- ── A. the column  (NOTICE pane)
do $$
declare c record;
begin
  select data_type, is_nullable, column_default into c
    from information_schema.columns
   where table_schema = 'public' and table_name = 'applications' and column_name = 'tv_show_featured';
  if not found then raise exception 'FAIL A: applications.tv_show_featured missing'; end if;
  if c.data_type <> 'boolean' or c.is_nullable <> 'YES' or c.column_default is not null then
    raise exception 'FAIL A: tv_show_featured should be a nullable boolean with no default: %', c;
  end if;
  -- private to the row: not exposed to anon or the public directory view
  if has_column_privilege('anon', 'public.applications', 'tv_show_featured', 'select') then
    raise exception 'FAIL A: anon can read tv_show_featured';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications_public' and column_name = 'tv_show_featured') then
    raise exception 'FAIL A: tv_show_featured leaked into applications_public';
  end if;
  raise notice 'PASS A: nullable boolean, no default, not readable by anon, not in applications_public';
end $$;

-- ── B. the backfill  (NOTICE pane)
do $$
declare n int;
begin
  n := (select count(*) from public.applications
         where exhibitor_type = 'artist' and coalesce(btrim(tv_show), '') <> '' and tv_show_featured is distinct from true);
  if n > 0 then raise exception 'FAIL B: % artist applications name a show but are not marked featured', n; end if;
  n := (select count(*) from public.applications where exhibitor_type = 'vendor' and tv_show_featured is not null);
  if n > 0 then raise exception 'FAIL B: % vendor applications carry an answer they were never asked', n; end if;
  raise notice 'PASS B: every artist row naming a show is marked Yes; vendors untouched';
end $$;

-- ── C. counts  (RESULTS pane)
select exhibitor_type,
       count(*) filter (where tv_show_featured is true)  as yes,
       count(*) filter (where tv_show_featured is false) as no,
       count(*) filter (where tv_show_featured is null)  as not_recorded
  from public.applications
 group by exhibitor_type
 order by exhibitor_type;
