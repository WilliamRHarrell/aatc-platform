-- Add featured_footer boolean to sponsorships for site-wide footer display
alter table sponsorships add column if not exists featured_footer boolean not null default false;

-- Allow public read access to featured footer sponsors (for the site footer)
create policy "Public can read featured footer sponsors"
  on sponsorships for select
  using (featured_footer = true and status = 'confirmed');
