-- Add sponsorship_id to invoices table (nullable, alongside application_id)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sponsorship_id uuid REFERENCES sponsorships(id);

-- Make application_id nullable so sponsorship invoices don't need one
ALTER TABLE invoices ALTER COLUMN application_id DROP NOT NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_invoices_sponsorship_id ON invoices(sponsorship_id);
