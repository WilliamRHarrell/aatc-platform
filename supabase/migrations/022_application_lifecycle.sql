-- ============================================================
-- Migration 022: Application lifecycle columns + status enum
-- Run after migrations 020 and 021. Adds expired/canceled to the
-- application_status enum, plus tracking columns for deposit and
-- final-payment deadlines.
-- ============================================================

-- Extend status enum
alter type application_status add value if not exists 'expired';
alter type application_status add value if not exists 'canceled';

-- Approval timestamp (when admin clicks Approve)
alter table applications
  add column if not exists approved_at timestamptz;

-- Computed at approval time. deposit_due_at = approved_at + 30 days.
-- final_due_at = 2027-01-01 00:00 (Eastern, expressed as timestamptz).
alter table applications
  add column if not exists deposit_due_at timestamptz;

alter table applications
  add column if not exists final_due_at timestamptz;

-- For pre-loaded returning customers (Plan 4); included now so the
-- visibility RLS policy can reference it without a follow-up migration.
alter table applications
  add column if not exists needs_roster boolean not null default false;

-- Index helps the cron sweep find applications whose deadlines have passed.
create index if not exists applications_deposit_due_at_idx
  on applications (deposit_due_at)
  where status = 'approved';

create index if not exists applications_final_due_at_idx
  on applications (final_due_at)
  where status = 'approved';
