-- Add additional_items column for sponsors who select a tier + individual items
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS additional_items text[] DEFAULT '{}';
