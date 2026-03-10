# Food Truck Feature Design

## Goal
Admin-managed food truck vendor system with invoicing, portal login for vendors, and a public-facing food truck page.

## Pricing
- 1 day: $60 (6000 cents)
- 2 days: $120 (12000 cents)
- 3 days: $160 (16000 cents)
- Thursday setup: free, max 2 trucks per event

## Database

### `food_trucks` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| event_id | uuid FK events | not null, on delete cascade |
| user_id | uuid FK auth.users | nullable, set when vendor creates account |
| business_name | text | not null |
| contact_name | text | not null |
| email | text | not null |
| phone | text | nullable |
| website | text | nullable |
| instagram | text | nullable |
| facebook | text | nullable |
| cuisine_type | text | default '' |
| description | text | default '' |
| logo_url | text | nullable, path in food-truck-logos bucket |
| days | text[] | default '{}', subset of friday/saturday/sunday |
| thursday_setup | boolean | default false, max 2 per event |
| is_published | boolean | default false |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### `invoices` table modification
Add nullable `food_truck_id` FK column referencing `food_trucks(id)`.

### RLS
- Admin: full access (is_admin())
- Public: select where is_published = true
- Authenticated: update own row where user_id = auth.uid()

### Storage
- Bucket: `food-truck-logos` (public, 5MB, jpg/png/webp)
- Path: `{food_truck_id}/logo.{ext}`

## Admin Page: `/admin/food-trucks`

### Table view
Columns: business name, cuisine, days (badges), Thursday (badge), payment status ($), published toggle, edit button.

### "Add Food Truck" modal
Fields: business name*, contact name*, email*, phone, cuisine type, description, days (Fri/Sat/Sun checkboxes), Thursday setup checkbox (disabled if 2 already taken), logo upload, deposit/pay-full.

Invoice auto-created on add. Amount determined by number of days selected.

### Edit
Click row to open edit drawer/modal. All fields editable. Can change days (recalculates invoice if needed).

## Portal Integration (`/portal`)
- Check `food_trucks` table by user_id alongside existing application check
- Show food truck invoice (pay via existing Stripe checkout)
- Editable fields: business name, cuisine type, description, logo, website, instagram, facebook
- Same portal page, new section for food truck vendors

## Public Page: `/events/food-truck-rodeo`
- Rewrite existing static page to be dynamic
- Fetch published food trucks from DB
- Card grid: logo, business name, cuisine type, day badges (Fri/Sat/Sun), social links (instagram, facebook, website)
- Same dark theme as other event pages

## Admin Nav
- Add "Food Trucks" link between Panels and Sponsorships in admin sidebar

## Stripe Webhook
- Existing webhook already handles invoice payments via `invoice_id` metadata
- Food truck invoices use the same `invoices` table, just with `food_truck_id` instead of `application_id`
- No webhook changes needed

## TypeScript Types
- Add `food_trucks` to `src/types/database.ts`
- Add `food_truck_id` to invoices types
