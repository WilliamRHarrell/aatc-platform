-- Add amount_paid column to invoices for partial payment tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid integer NOT NULL DEFAULT 0;
