-- ============================================================
-- Migration 023: Invoice milestone timestamps
-- Run after migration 022. Adds deposit_paid_at and final_paid_at,
-- which the webhook fires when amount_paid crosses 25% / 100%.
-- ============================================================

alter table invoices
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists final_paid_at timestamptz;

create index if not exists invoices_deposit_paid_at_idx
  on invoices (deposit_paid_at)
  where deposit_paid_at is not null;
