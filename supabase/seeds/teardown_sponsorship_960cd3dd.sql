-- ============================================================
-- TEARDOWN 2026-09-25: the incognito test sponsorship "Creative Champion"
-- (gold, ryan@creativechampion.com) submitted through /api/sponsor-apply
-- while testing PR #10. Pending, never approved: no invoice, no credits.
--
-- HOW TO RUN: paste the whole file. ABORTS before writing unless every fact
-- matches the live row. Then remove the logo file:
--   node scripts/remove-storage-object.mjs exhibitor-media sponsors/32a84205-e683-4617-ab73-a43595cd63ef.png --delete
--
-- The pinup registration from the same test left NO row (pinup_entries is
-- empty as of 2026-09-25 17:00 UTC), so there is nothing to remove there.
-- ============================================================
begin;

do $$
declare v_id uuid := '960cd3dd-7fe6-4bb8-9768-a0c81a910d83';
begin
  if (select sponsor_name from public.sponsorships where id = v_id) is distinct from 'Creative Champion' then
    raise exception 'ABORT: 960cd3dd is not Creative Champion (or already deleted)';
  end if;
  if (select email from public.sponsorships where id = v_id) is distinct from 'ryan@creativechampion.com' then
    raise exception 'ABORT: email does not match the test address';
  end if;
  if (select status::text from public.sponsorships where id = v_id) is distinct from 'pending' then
    raise exception 'ABORT: status is not pending - it was approved since; use a teardown that handles the invoice';
  end if;
  if exists (select 1 from public.invoices where sponsorship_id = v_id) then raise exception 'ABORT: an invoice references this sponsorship'; end if;
  if exists (select 1 from public.presentation_credits where sponsorship_id = v_id) then raise exception 'ABORT: presentation credits reference it'; end if;
  if exists (select 1 from public.exclusivity_grants where sponsorship_id = v_id) then raise exception 'ABORT: exclusivity grants reference it'; end if;
  raise notice 'PRE-STATE OK';

  delete from public.sponsorships where id = v_id;
  if exists (select 1 from public.sponsorships where id = v_id) then raise exception 'FAIL: still present'; end if;
  raise notice 'DONE: deleted sponsorship 960cd3dd (Creative Champion). Now remove the logo file (see header).';
end $$;

commit;

-- Results grid: want zero rows.
select id, sponsor_name from public.sponsorships where sponsor_name = 'Creative Champion' or email = 'ryan@creativechampion.com';
