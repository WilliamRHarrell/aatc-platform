-- Update sponsor_tier enum: add 'title', 'brass', and individual sponsorship items
-- Remove 'bronze' (replaced by 'brass')
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'title' BEFORE 'platinum';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'brass' AFTER 'silver';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'collectible_coin' AFTER 'brass';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'vip_bag' AFTER 'collectible_coin';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'collectors_choice' AFTER 'vip_bag';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'artist_lounge' AFTER 'collectors_choice';
ALTER TYPE sponsor_tier ADD VALUE IF NOT EXISTS 'rafter_banner' AFTER 'artist_lounge';
