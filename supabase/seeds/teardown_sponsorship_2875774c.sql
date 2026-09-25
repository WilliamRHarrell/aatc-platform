-- ============================================================
-- TEARDOWN 2026-09-25: the test sponsorship "Ryanaskkkii" (platinum,
-- ryan+test222@ryanharrell.com), approved by Ryan while testing the sponsor
-- form, and the invoice its approval created.
--
-- HOW TO RUN: paste the whole file. It ABORTS before writing unless every
-- fact below matches the live rows, so it cannot hit a different sponsor or
-- run twice. Read the MESSAGES pane.
--
-- The logo FILE is in storage (exhibitor-media/sponsors/1790304268265-
-- xrnw4o34qjm.png). SQL cannot remove a storage object cleanly (a delete from
-- storage.objects orphans the underlying file). Remove it with
--   node scripts/remove-storage-object.mjs exhibitor-media sponsors/1790304268265-xrnw4o34qjm.png --delete
-- after this runs, or from the dashboard.
--
-- Live state read 2026-09-25 (service role): status confirmed, amount
-- 1000000, show_on_sponsors true (so sponsors_public LISTS it and /sponsors
-- can render it on the next cache refresh); one invoice c402bf7b, pending,
-- amount_paid 0, no Stripe ids; no presentation_credits, no exclusivity
-- grants.
-- ============================================================
begin;

do $$
declare
  v_id  uuid := '2875774c-218f-473b-9570-0cf4ff96593f';
  v_inv uuid := 'c402bf7b-9142-4da1-94a6-3b77f7ebe9a8';
  n int; v_paid int; v_stripe text;
begin
  if (select sponsor_name from public.sponsorships where id = v_id) is distinct from 'Ryanaskkkii' then
    raise exception 'ABORT: 2875774c is not Ryanaskkkii (or already deleted)';
  end if;
  if (select email from public.sponsorships where id = v_id) is distinct from 'ryan+test222@ryanharrell.com' then
    raise exception 'ABORT: email does not match the test address';
  end if;
  if (select amount from public.sponsorships where id = v_id) is distinct from 1000000 then
    raise exception 'ABORT: amount changed since the teardown was written';
  end if;
  n := (select count(*) from public.invoices where sponsorship_id = v_id);
  if n <> 1 then raise exception 'ABORT: expected exactly 1 invoice, found %', n; end if;
  v_paid := (select coalesce(amount_paid, 0) from public.invoices where id = v_inv and sponsorship_id = v_id);
  if v_paid is null then raise exception 'ABORT: invoice c402bf7b not found on this sponsorship'; end if;
  if v_paid <> 0 then raise exception 'ABORT: invoice has amount_paid = % - money moved, do not delete', v_paid; end if;
  v_stripe := (select coalesce(stripe_invoice_id, stripe_payment_intent_id) from public.invoices where id = v_inv);
  if v_stripe is not null then raise exception 'ABORT: invoice carries a Stripe id (%) - reconcile first', v_stripe; end if;
  if exists (select 1 from public.presentation_credits where sponsorship_id = v_id) then raise exception 'ABORT: presentation credits reference this sponsorship'; end if;
  if exists (select 1 from public.exclusivity_grants where sponsorship_id = v_id) then raise exception 'ABORT: exclusivity grants reference this sponsorship'; end if;
  raise notice 'PRE-STATE OK';

  -- Explicit, so the counts are honest rather than inferred from ON DELETE CASCADE (034).
  delete from public.invoices where id = v_inv;
  delete from public.sponsorships where id = v_id;

  if exists (select 1 from public.sponsorships where id = v_id) then raise exception 'FAIL: sponsorship still present'; end if;
  if exists (select 1 from public.invoices where id = v_inv or sponsorship_id = v_id) then raise exception 'FAIL: invoice still present'; end if;
  raise notice 'DONE: deleted sponsorship 2875774c (Ryanaskkkii) and invoice c402bf7b. Now remove the logo file (see header).';
end $$;

commit;

-- Results grid: want zero rows.
select id, sponsor_name, status from public.sponsorships where sponsor_name = 'Ryanaskkkii' or email = 'ryan+test222@ryanharrell.com';
