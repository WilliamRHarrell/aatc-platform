-- ============================================================
-- Migration 068: add 'square' to the payment_method convention.
--
-- payment_method is FREE TEXT, so this changes no behaviour and constrains
-- nothing. It exists because the documented set is the only thing that makes the
-- column readable: a value nobody wrote down becomes a value nobody recognises,
-- and reconciliation then depends on remembering what somebody typed once.
--
-- Migration 033 established the set as stripe_external, cash, check,
-- bank_transfer, other. All three 2027 sponsors paid a deposit through Square,
-- which is none of those. 033 is applied, so its comment is not edited; the
-- comment is re-issued here instead.
--
-- Re-stated in full rather than appended to, because `comment on` REPLACES.
-- ============================================================

begin;

comment on column public.invoices.payment_method is
  'How the most recent payment was taken: stripe_external, square, cash, check, bank_transfer, other. NULL for payments collected through the platform''s own Stripe checkout (the webhook records those). Free text: this list is a convention, not a constraint, and it is the only thing that keeps the column readable.';

commit;


-- ── REPORT ──────────────────────────────────────────────────
-- want: the comment above, containing 'square'.
select col_description('public.invoices'::regclass,
         (select ordinal_position from information_schema.columns
           where table_schema = 'public' and table_name = 'invoices'
             and column_name = 'payment_method')::int) as payment_method_convention;
