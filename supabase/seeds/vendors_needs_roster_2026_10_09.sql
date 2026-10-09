-- ============================================================
-- DATA FIX 2026-10-09: an ID document does not affect the directory (Ryan).
--   Two approved VENDORS are held off the directory only by needs_roster
--   (set while their booth-holder ID was outstanding). A vendor has no
--   roster, so by the rule (approved + roster complete + deposit/comp/
--   override) the flag should be false:
--     "Rhino's Exotic Wooden Pipes"  deposit paid    -> listed after this
--     "Orebro International"         no deposit yet  -> listed once it pays
--   (production read, 2026-10-09)
--
-- SIDE EFFECT: the portal shows "complete your roster" (booth-holder ID
-- upload) only while needs_roster is true, so these two stop being asked for
-- it there. An ID can still be added in the admin editor.
--
-- HOW TO RUN: paste the whole file. ABORTS before writing unless exactly
-- these two rows match. Read the MESSAGES pane, then the results grid.
-- ============================================================
begin;

do $$
declare n int;
begin
  n := (select count(*) from public.applications
         where business_name in ('Rhino''s Exotic Wooden Pipes', 'Orebro International'));
  if n <> 2 then raise exception 'ABORT: expected 2 rows by name, found %', n; end if;
  if exists (select 1 from public.applications
              where business_name in ('Rhino''s Exotic Wooden Pipes', 'Orebro International')
                and (exhibitor_type <> 'vendor' or status <> 'approved' or needs_roster is not true)) then
    raise exception 'ABORT: a row is not an approved vendor with needs_roster true (already fixed?)';
  end if;
  raise notice 'PRE-STATE OK';

  update public.applications set needs_roster = false
   where business_name in ('Rhino''s Exotic Wooden Pipes', 'Orebro International')
     and exhibitor_type = 'vendor' and status = 'approved' and needs_roster = true;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'FAIL: updated % rows, expected 2', n; end if;
  raise notice 'DONE: needs_roster cleared on 2 vendors';
end $$;

commit;

-- Results grid: Rhino's listed = true; Orebro listed = false until its deposit is paid.
select a.business_name, a.needs_roster,
       exists (select 1 from public.applications_public p where p.id = a.id) as listed
  from public.applications a
 where a.business_name in ('Rhino''s Exotic Wooden Pipes', 'Orebro International')
 order by a.business_name;
