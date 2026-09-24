-- ============================================================
-- DATA FIX 2026-09-24: comp two applications (run AFTER migration 072).
--
-- HOW TO RUN: paste the whole file. Read the MESSAGES pane. It ABORTS before
-- writing if any row is not in the exact pre-state below, so it cannot run
-- twice or against the wrong database. The post-state block prints what
-- landed; a green run with wrong values is not a pass - read the numbers.
--
-- 1. 13c265d7 Skin Reserve (Ryan's test): approve/send-back/comp/approve lost
--    the comp. Full comp: comped_at/by, invoice b532e75f -> 0 / paid / paid_at
--    + both milestones, due dates null. (Same writes as comp_application().)
-- 2. 44c185e8 The Pinback Button Club (REAL vendor): the comp landed on the
--    invoice (70396b61: 0 / paid) but the milestones were never set, so it
--    was unassignable, and the due dates stayed. Set comped_at/by, both
--    milestones, clear the due dates. Amount and status are NOT touched.
--    The comp notice email is a separate, deliberate send from the drawer
--    ("Send comp notice") AFTER this runs - nothing here sends anything.
--
-- comped_by = Ryan's admin profile, looked up by email, never hard-coded.
-- Neither block touches applications.status (lifecycle rule).
-- ============================================================
begin;

do $$
declare
  v_ryan uuid;
  v_app1 uuid := '13c265d7-04e4-4142-a673-721201ded275';
  v_inv1 uuid := 'b532e75f-b6d6-4a0d-82fb-6443fb28e681';
  v_app2 uuid := '44c185e8-b578-4a56-8d4d-a7f1231bed0e';
  v_inv2 uuid := '70396b61-ed87-49c5-b0a2-cb152552ad8b';
  n int; v_status text; v_amt int; v_paid int; v_inv_status text; v_ts timestamptz;
begin
  if not exists (select 1 from information_schema.columns where table_name = 'applications' and column_name = 'comped_at') then
    raise exception 'ABORT: migration 072 is not applied (no comped_at column)';
  end if;
  v_ryan := (select id from public.profiles where email = 'ryan@americantattoosociety.com' and role = 'admin');
  if v_ryan is null then raise exception 'ABORT: Ryan''s admin profile not found by email'; end if;

  -- ── Pre-state: 13c265d7 Skin Reserve ──
  if (select business_name from public.applications where id = v_app1) is distinct from 'Skin Reserve' then
    raise exception 'ABORT: 13c265d7 is not Skin Reserve';
  end if;
  if (select comped_at from public.applications where id = v_app1) is not null then raise exception 'ABORT: 13c265d7 already comped'; end if;
  n := (select count(*) from public.invoices where application_id = v_app1);
  if n <> 1 then raise exception 'ABORT: 13c265d7 has % invoices, expected 1', n; end if;
  v_amt := (select amount from public.invoices where id = v_inv1 and application_id = v_app1);
  v_paid := (select coalesce(amount_paid, 0) from public.invoices where id = v_inv1);
  v_inv_status := (select status::text from public.invoices where id = v_inv1);
  if v_amt is distinct from 60000 or v_paid <> 0 or v_inv_status is distinct from 'pending' then
    raise exception 'ABORT: invoice b532e75f pre-state changed (amount=%, paid=%, status=%)', v_amt, v_paid, v_inv_status;
  end if;

  -- ── Pre-state: 44c185e8 The Pinback Button Club ──
  if (select trim(business_name) from public.applications where id = v_app2) is distinct from 'The Pinback Button Club' then
    raise exception 'ABORT: 44c185e8 is not The Pinback Button Club';
  end if;
  if (select comped_at from public.applications where id = v_app2) is not null then raise exception 'ABORT: 44c185e8 already comped'; end if;
  v_status := (select status::text from public.applications where id = v_app2);
  if v_status is distinct from 'approved' then raise exception 'ABORT: 44c185e8 status is %, expected approved', v_status; end if;
  n := (select count(*) from public.invoices where application_id = v_app2);
  if n <> 1 then raise exception 'ABORT: 44c185e8 has % invoices, expected 1', n; end if;
  v_amt := (select amount from public.invoices where id = v_inv2 and application_id = v_app2);
  v_paid := (select coalesce(amount_paid, 0) from public.invoices where id = v_inv2);
  v_inv_status := (select status::text from public.invoices where id = v_inv2);
  if v_amt is distinct from 0 or v_paid <> 0 or v_inv_status is distinct from 'paid' then
    raise exception 'ABORT: invoice 70396b61 pre-state changed (amount=%, paid=%, status=%)', v_amt, v_paid, v_inv_status;
  end if;
  if (select deposit_paid_at from public.invoices where id = v_inv2) is not null then raise exception 'ABORT: 70396b61 already has deposit_paid_at'; end if;
  raise notice 'PRE-STATE OK for both rows';

  -- ── Write 1: Skin Reserve, full comp ──
  update public.applications
     set comped_at = now(), comped_by = v_ryan, deposit_due_at = null, final_due_at = null
   where id = v_app1;
  update public.invoices
     set amount = 0, status = 'paid', paid_at = coalesce(paid_at, now()),
         deposit_paid_at = now(), final_paid_at = now()
   where id = v_inv1;

  -- ── Write 2: Pinback Button Club, milestones + comp mark only ──
  update public.applications
     set comped_at = now(), comped_by = v_ryan, deposit_due_at = null, final_due_at = null
   where id = v_app2;
  update public.invoices
     set deposit_paid_at = now(), final_paid_at = now(), paid_at = coalesce(paid_at, now())
   where id = v_inv2;

  -- ── Post-state: assert VALUES, not non-nullness ──
  v_ts := (select comped_at from public.applications where id = v_app1);
  if v_ts is null or (select deposit_due_at from public.applications where id = v_app1) is not null then raise exception 'FAIL: 13c265d7 not comped'; end if;
  if (select amount from public.invoices where id = v_inv1) <> 0 or (select status::text from public.invoices where id = v_inv1) <> 'paid' then raise exception 'FAIL: b532e75f not settled'; end if;
  if (select status::text from public.applications where id = v_app1) <> 'approved' then raise exception 'FAIL: 13c265d7 status changed'; end if;

  if (select comped_by from public.applications where id = v_app2) is distinct from v_ryan then raise exception 'FAIL: 44c185e8 comped_by'; end if;
  if (select deposit_paid_at from public.invoices where id = v_inv2) is null or (select final_paid_at from public.invoices where id = v_inv2) is null then raise exception 'FAIL: 70396b61 milestones'; end if;
  if (select amount from public.invoices where id = v_inv2) <> 0 or (select status::text from public.invoices where id = v_inv2) <> 'paid' then raise exception 'FAIL: 70396b61 amount/status changed'; end if;
  if (select deposit_due_at from public.applications where id = v_app2) is not null then raise exception 'FAIL: 44c185e8 due dates not cleared'; end if;
  if (select status::text from public.applications where id = v_app2) <> 'approved' then raise exception 'FAIL: 44c185e8 status changed'; end if;

  raise notice 'DONE: 13c265d7 comped (invoice 0/paid, milestones set, due dates null)';
  raise notice 'DONE: 44c185e8 comped (milestones set, due dates null, amount/status untouched). Now send the comp notice from the drawer.';
end $$;

commit;

-- Results grid: the two rows after the fix.
select a.id, a.business_name, a.status, a.comped_at, a.deposit_due_at, a.final_due_at,
       i.amount, i.status as invoice_status, i.deposit_paid_at, i.final_paid_at
  from public.applications a join public.invoices i on i.application_id = a.id
 where a.id in ('13c265d7-04e4-4142-a673-721201ded275', '44c185e8-b578-4a56-8d4d-a7f1231bed0e');
