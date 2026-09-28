-- ============================================================
-- HOW TO RUN: after 085 is applied, paste the whole file. Read the MESSAGES
-- pane and the grid. Read-only: no fixtures.
-- ============================================================

-- ── A. column, view shape, nothing from 065 lost  (NOTICE pane)
do $$
declare v_def text; v_cols text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'panels'
                  and column_name = 'signup_closed' and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'FAIL A: panels.signup_closed missing, nullable, or not default false - 085 is not applied';
  end if;

  v_cols := (select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns
              where table_schema = 'public' and table_name = 'panels_public');
  if v_cols is distinct from 'id, event_id, title, description, panel_date, panel_time, location, panelists, is_free, cost, signup_type, max_capacity, image_url, host_email, presented_by, presented_by_website, presented_by_logo_url, presented_by_linked, panel_day, panel_start, signup_closed' then
    raise exception 'FAIL A: panels_public columns are not 065''s list plus signup_closed last: %', v_cols;
  end if;

  v_def := pg_get_viewdef('public.panels_public'::regclass);
  if position('buyer_name' in v_def) = 0 then raise exception 'FAIL A: the presentation-credit join (065) is gone from panels_public'; end if;
  if position('email_host' in v_def) = 0 then raise exception 'FAIL A: host_email is no longer masked to email-host panels'; end if;
  if position('is_published' in v_def) = 0 then raise exception 'FAIL A: panels_public no longer filters to published panels'; end if;
  if not has_table_privilege('anon', 'public.panels_public', 'select') then raise exception 'FAIL A: anon lost SELECT on panels_public'; end if;
  raise notice 'PASS A: signup_closed present (default false), appended last to panels_public; 065 join, host_email mask, published filter and anon grant intact';
end $$;

-- ── B. email-host panels and their switch  (results grid)
select title, signup_type, host_email is not null as has_host_email, signup_closed, is_published
  from public.panels
 where signup_type = 'email_host'
 order by title;
