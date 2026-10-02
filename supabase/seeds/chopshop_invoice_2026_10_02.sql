-- Chop Shop Tattoo (application c6cfee7f): booth comped by agreement, the
-- four artist permits charged at $50 each. Invoice 98d827cb: $225.00 -> $200.00,
-- still pending. Refuses unless the invoice is exactly as read on 2026-10-02:
-- $225.00, nothing paid, no payment milestones, no Stripe payment.
-- Only `amount` changes (plus updated_at, set by its trigger).
do $$
declare n int;
begin
  update public.invoices
     set amount = 20000
   where id = '98d827cb-5cfb-4817-a8d2-a9308549ace2'
     and application_id = 'c6cfee7f-0cdf-45d6-abaf-897dd2ed3f67'
     and amount = 22500
     and coalesce(amount_paid, 0) = 0
     and status = 'pending'
     and paid_at is null and deposit_paid_at is null and final_paid_at is null
     and stripe_payment_intent_id is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'ABORT: expected exactly one unpaid $225.00 pending invoice, matched %. Nothing changed.', n;
  end if;
  raise notice 'DONE: invoice 98d827cb is now $200.00, pending, nothing paid';
end $$;

select id, amount, amount_paid, status, paid_at, deposit_paid_at, final_paid_at, updated_at
  from public.invoices where id = '98d827cb-5cfb-4817-a8d2-a9308549ace2';
