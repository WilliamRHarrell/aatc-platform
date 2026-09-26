-- ============================================================
-- Skin Reserve is an IN-KIND sponsor (2026-09-26, Ryan): its booth
-- (application 13c265d7) is comped in exchange for product for the contests
-- and shops. The sponsorship row already exists (3c393126: confirmed, gold,
-- $5,000, show_on_sponsors) with is_in_kind = false; this flips the flag.
--
-- amount stays $5,000 as entered: for an in-kind row it is the value of the
-- product, not money owed, and no invoice is created. If $5,000 is not the
-- agreed product value, change it in /admin/sponsorships.
-- One DO block; a second run aborts (already in kind).
-- ============================================================
do $$
declare n int;
begin
  if (select sponsor_name from public.sponsorships where id = '3c393126-8139-49aa-9c7a-f5e4d3770710') is distinct from 'Skin Reserve' then
    raise exception 'ABORT: sponsorship 3c393126 is not Skin Reserve';
  end if;
  if (select status::text from public.sponsorships where id = '3c393126-8139-49aa-9c7a-f5e4d3770710') <> 'confirmed' then
    raise exception 'ABORT: Skin Reserve sponsorship is not confirmed';
  end if;
  if exists (select 1 from public.invoices where sponsorship_id = '3c393126-8139-49aa-9c7a-f5e4d3770710') then
    raise exception 'ABORT: an invoice exists for the Skin Reserve sponsorship - an in-kind row should not be billed; resolve that first';
  end if;
  update public.sponsorships set is_in_kind = true
   where id = '3c393126-8139-49aa-9c7a-f5e4d3770710' and is_in_kind = false;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ABORT: expected 1 row updated, got % (already in kind?)', n; end if;
  raise notice 'DONE: Skin Reserve sponsorship is in kind';
end $$;

select sponsor_name, status, tier, amount / 100.0 as value, is_in_kind, show_on_sponsors
  from public.sponsorships where id = '3c393126-8139-49aa-9c7a-f5e4d3770710';
