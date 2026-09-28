-- ============================================================
-- HOW TO RUN: after 081 is applied, paste the whole file. Read the MESSAGES
-- pane and the grid. Read-only: no fixtures.
-- ============================================================

-- ── A. columns present, nullable, and no policy changed  (NOTICE pane)
do $$
declare n int;
begin
  n := (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'invoices'
           and column_name in ('due_reminder_30_sent_at', 'due_reminder_7_sent_at') and is_nullable = 'YES');
  if n <> 2 then raise exception 'FAIL A: expected 2 nullable reminder columns on invoices, found %', n; end if;
  if (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'invoices')
     is distinct from 'invoices: admin all, invoices: own read' then
    raise exception 'FAIL A: invoices policies are not exactly "invoices: admin all", "invoices: own read" - read the list before trusting 081';
  end if;
  raise notice 'PASS A: reminder columns present; invoices policies unchanged';
end $$;

-- ── B. what the sweep will look at  (results grid)
-- Sponsor invoices with a due date and a balance. `reminders_can_reach` is
-- false until the sponsorship has an email or a linked account.
select s.sponsor_name, i.due_date, (i.amount - i.amount_paid) / 100.0 as balance, i.status,
       i.due_reminder_30_sent_at, i.due_reminder_7_sent_at,
       (coalesce(s.email, '') <> '' or s.user_id is not null) as reminders_can_reach
  from public.invoices i join public.sponsorships s on s.id = i.sponsorship_id
 where i.due_date is not null and i.status in ('pending', 'overdue')
   and s.sponsor_name not ilike 'ZZ %'  -- test rows (RLS harness, verify fixtures) are never reminded
 order by i.due_date, s.sponsor_name;
