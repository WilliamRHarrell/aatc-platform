-- Add contact/auth fields to sponsorships
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS facebook text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Index for portal lookup
CREATE INDEX IF NOT EXISTS idx_sponsorships_user_id ON sponsorships(user_id);
CREATE INDEX IF NOT EXISTS idx_sponsorships_email ON sponsorships(email);

-- Allow public inserts for the application form (no auth required)
CREATE POLICY IF NOT EXISTS "Anyone can submit sponsor application"
  ON sponsorships FOR INSERT
  WITH CHECK (status = 'pending');

-- Allow sponsors to read their own sponsorship
CREATE POLICY IF NOT EXISTS "Sponsors can read own sponsorship"
  ON sponsorships FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
