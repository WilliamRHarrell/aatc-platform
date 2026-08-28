# Food Truck Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin-managed food truck vendor system with invoicing, portal login for vendors, and a public-facing food truck page.

**Architecture:** New `food_trucks` table linked to events and optionally to auth users. Admin creates food truck entries and invoices. Vendors log in via existing portal to pay invoices and edit their profile. Public page fetches published food trucks from DB.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Auth + Storage + RLS), Stripe Checkout (existing), react-hot-toast, Tailwind + inline styles for dark theme.

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/017_food_trucks.sql`

**Step 1: Write the migration SQL**

```sql
-- Food trucks table
create table if not exists food_trucks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website text,
  instagram text,
  facebook text,
  cuisine_type text not null default '',
  description text not null default '',
  logo_url text,
  days text[] not null default '{}',
  thursday_setup boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add food_truck_id to invoices
alter table invoices add column if not exists food_truck_id uuid references food_trucks(id) on delete set null;

-- RLS
alter table food_trucks enable row level security;

-- Admin full access
create policy "Admin full access on food_trucks"
  on food_trucks for all
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

-- Public read published
create policy "Public read published food_trucks"
  on food_trucks for select
  using (is_published = true);

-- Authenticated update own
create policy "Vendors update own food_truck"
  on food_trucks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage bucket for logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-truck-logos', 'food-truck-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Storage policies
create policy "Public read food truck logos"
  on storage.objects for select
  using (bucket_id = 'food-truck-logos');

create policy "Admin insert food truck logos"
  on storage.objects for insert
  with check (bucket_id = 'food-truck-logos' and (select role from profiles where id = auth.uid()) = 'admin');

create policy "Admin delete food truck logos"
  on storage.objects for delete
  using (bucket_id = 'food-truck-logos' and (select role from profiles where id = auth.uid()) = 'admin');

create policy "Vendors insert own food truck logos"
  on storage.objects for insert
  with check (bucket_id = 'food-truck-logos' and auth.uid() is not null);

create policy "Vendors update own food truck logos"
  on storage.objects for update
  using (bucket_id = 'food-truck-logos' and auth.uid() is not null);
```

**Step 2: Run the migration in Supabase SQL Editor**

Copy the SQL above and run it in the Supabase SQL Editor (Dashboard > SQL Editor).

**Step 3: Commit**

```bash
git add supabase/migrations/017_food_trucks.sql
git commit -m "feat: add food_trucks table, invoices FK, storage bucket"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Add food_trucks table types**

Add after the `sponsorships` table definition (before the closing of `Tables`):

```typescript
food_trucks: {
  Row: {
    id: string
    event_id: string
    user_id: string | null
    business_name: string
    contact_name: string
    email: string
    phone: string | null
    website: string | null
    instagram: string | null
    facebook: string | null
    cuisine_type: string
    description: string
    logo_url: string | null
    days: string[]
    thursday_setup: boolean
    is_published: boolean
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    event_id: string
    user_id?: string | null
    business_name: string
    contact_name: string
    email: string
    phone?: string | null
    website?: string | null
    instagram?: string | null
    facebook?: string | null
    cuisine_type?: string
    description?: string
    logo_url?: string | null
    days?: string[]
    thursday_setup?: boolean
    is_published?: boolean
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    event_id?: string
    user_id?: string | null
    business_name?: string
    contact_name?: string
    email?: string
    phone?: string | null
    website?: string | null
    instagram?: string | null
    facebook?: string | null
    cuisine_type?: string
    description?: string
    logo_url?: string | null
    days?: string[]
    thursday_setup?: boolean
    is_published?: boolean
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
```

**Step 2: Add food_truck_id to invoices types**

In the `invoices` section, add to Row, Insert, and Update:

```typescript
// Row:
food_truck_id: string | null

// Insert:
food_truck_id?: string | null

// Update:
food_truck_id?: string | null
```

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add food_trucks types and food_truck_id to invoices"
```

---

## Task 3: Admin Nav Update

**Files:**
- Modify: `src/app/admin/layout.tsx`

**Step 1: Add Food Trucks nav item**

In the `NAV` array, add a new entry between the Panels item (index 6) and Sponsorships item (index 7):

```typescript
{
  href: '/admin/food-trucks',
  label: 'Food Trucks',
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2"/>
      <path d="M16 8h4l3 5v4h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
},
```

Insert this after the Panels entry (`/admin/panels`) and before the Sponsorships entry (`/admin/sponsorships`).

**Step 2: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: add Food Trucks to admin nav"
```

---

## Task 4: Admin Food Trucks Page

**Files:**
- Create: `src/app/admin/food-trucks/page.tsx`

This is the largest task. The page follows the same pattern as `src/app/admin/sponsorships/page.tsx`:
- `'use client'` component
- Fetch active event, then food trucks + invoices for that event
- Table view with add modal and edit modal
- Auto-create invoice on add

**Step 1: Create the admin food trucks page**

Key constants:

```typescript
const DAY_OPTIONS = ['friday', 'saturday', 'sunday'] as const
const PRICING: Record<number, number> = { 1: 6000, 2: 12000, 3: 16000 }
```

Interface:

```typescript
interface FoodTruck {
  id: string
  event_id: string
  user_id: string | null
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  cuisine_type: string
  description: string
  logo_url: string | null
  days: string[]
  thursday_setup: boolean
  is_published: boolean
  created_at: string
}

interface FoodTruckInvoice {
  id: string
  food_truck_id: string
  amount: number
  amount_paid: number
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
}

interface FormState {
  business_name: string
  contact_name: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  cuisine_type: string
  description: string
  days: string[]
  thursday_setup: boolean
}
```

**Page behavior:**

1. **Data fetching**: On mount, get active event, then fetch `food_trucks` where `event_id = event.id` and `invoices` where `food_truck_id is not null`.

2. **Table columns**: Business Name, Cuisine, Days (badges), Thursday (badge), Payment ($), Published (toggle), Edit (button).

3. **Add Modal**: Form fields for all FormState fields. Days = Fri/Sat/Sun checkboxes. Thursday checkbox disabled if already 2 trucks have `thursday_setup = true` for this event. Logo file upload. Amount auto-calculated from `PRICING[days.length]`. On submit:
   - Insert food truck row
   - Upload logo if provided to `food-truck-logos/{food_truck_id}/logo.{ext}`
   - Update food truck with `logo_url`
   - Insert invoice row with `food_truck_id`, `amount = PRICING[days.length]`, `status = 'pending'`
   - Show toast, reload data

4. **Edit Modal**: Same fields, pre-populated. On save:
   - Update food truck row
   - If days changed, check if invoice exists and is still pending → update amount
   - Upload new logo if changed

5. **Published toggle**: Direct update on `food_trucks` table, toggle `is_published`.

6. **Delete**: Confirm, then delete food truck row (cascade handles invoice FK).

**Styling**: Same dark theme as sponsorships page:
- `backgroundColor: '#0a0a0a'` page bg
- `backgroundColor: '#1a1a1a'` cards/table
- `border: '1px solid #2a2a2a'` borders
- `color: '#8B7355'` / `'#C4A882'` gold accents
- `react-hot-toast` for notifications

**Step 2: Verify the page loads**

Run: `npm run dev`
Navigate to: `http://localhost:3000/admin/food-trucks`
Expected: Page loads with empty state, nav link is highlighted.

**Step 3: Test adding a food truck**

Click "Add Food Truck", fill out form, submit. Verify:
- Row appears in table
- Invoice created in `invoices` table with correct amount
- Logo uploaded to storage if provided

**Step 4: Commit**

```bash
git add src/app/admin/food-trucks/page.tsx
git commit -m "feat: admin food trucks page with CRUD and invoicing"
```

---

## Task 5: Checkout & Webhook Updates

**Files:**
- Modify: `src/app/api/create-checkout/route.ts`

**Step 1: Add food_truck_id handling to create-checkout**

In the checkout route, after the `sponsorship_id` block (~line 70), add:

```typescript
} else if (inv.food_truck_id) {
  const { data: truck } = await supabase
    .from('food_trucks')
    .select('business_name')
    .eq('id', inv.food_truck_id)
    .single()

  if (truck) {
    productName = truck.business_name
    description = `AATC 2027 - Food truck vendor fee${isFullPayment ? '' : ' - partial payment'}`
  }
}
```

Also add `food_truck_id` to the select query on the invoice (~line 36):

```typescript
.select('id, amount, amount_paid, status, application_id, sponsorship_id, food_truck_id')
```

And add to metadata:

```typescript
...(inv.food_truck_id ? { food_truck_id: inv.food_truck_id } : {}),
```

**Step 2: No webhook changes needed**

The webhook already handles any invoice by `invoice_id` metadata. The `food_truck_id` is just an FK on the invoice row - the webhook updates `amount_paid` and `status` based on `invoice_id` alone. No changes required.

**Step 3: Commit**

```bash
git add src/app/api/create-checkout/route.ts
git commit -m "feat: add food truck support to checkout route"
```

---

## Task 6: Portal Integration

**Files:**
- Modify: `src/app/portal/page.tsx`

**Step 1: Add FoodTruck interface and state**

Add interface:

```typescript
interface FoodTruck {
  id: string
  business_name: string
  contact_name: string
  email: string
  cuisine_type: string
  description: string
  website: string | null
  instagram: string | null
  facebook: string | null
  logo_url: string | null
  days: string[]
  thursday_setup: boolean
}
```

Add state:

```typescript
const [foodTruck, setFoodTruck] = useState<FoodTruck | null>(null)
const [foodTruckInvoice, setFoodTruckInvoice] = useState<Invoice | null>(null)
const [editingFoodTruck, setEditingFoodTruck] = useState(false)
const [foodTruckForm, setFoodTruckForm] = useState({ business_name: '', cuisine_type: '', description: '', website: '', instagram: '', facebook: '' })
const [foodTruckLogoFile, setFoodTruckLogoFile] = useState<File | null>(null)
```

**Step 2: Fetch food truck data**

In the existing `useEffect` data-fetching block, after checking for application, add:

```typescript
// Check for food truck
const { data: truckData } = await supabase
  .from('food_trucks')
  .select('*')
  .eq('user_id', user.id)
  .single()

if (truckData) {
  setFoodTruck(truckData)
  setFoodTruckForm({
    business_name: truckData.business_name,
    cuisine_type: truckData.cuisine_type,
    description: truckData.description,
    website: truckData.website || '',
    instagram: truckData.instagram || '',
    facebook: truckData.facebook || '',
  })

  // Fetch food truck invoice
  const { data: ftInv } = await supabase
    .from('invoices')
    .select('*')
    .eq('food_truck_id', truckData.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (ftInv) setFoodTruckInvoice(ftInv)
}
```

**Step 3: Add food truck portal section**

After the existing application/sponsorship sections in the JSX, add a new section for food truck vendors:

```tsx
{foodTruck && (
  <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
    <h2 className="text-lg font-bold text-white mb-4">Food Truck Vendor</h2>

    {/* Invoice section - same pattern as existing invoice display */}
    {foodTruckInvoice && (
      // ... invoice display with pay button using existing handlePay pattern
    )}

    {/* Editable profile fields */}
    {editingFoodTruck ? (
      // ... edit form for business_name, cuisine_type, description, website, instagram, facebook, logo
    ) : (
      // ... display view with Edit button
    )}
  </div>
)}
```

The edit form saves via:
```typescript
const { error } = await supabase
  .from('food_trucks')
  .update({
    business_name: foodTruckForm.business_name,
    cuisine_type: foodTruckForm.cuisine_type,
    description: foodTruckForm.description,
    website: foodTruckForm.website || null,
    instagram: foodTruckForm.instagram || null,
    facebook: foodTruckForm.facebook || null,
  })
  .eq('id', foodTruck.id)
```

Logo upload goes to `food-truck-logos/{food_truck_id}/logo.{ext}`.

The pay button uses the same `handlePay` function that already exists in the portal, passing `foodTruckInvoice.id`.

**Step 4: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "feat: add food truck vendor section to portal"
```

---

## Task 7: Public Food Truck Page

**Files:**
- Modify: `src/app/events/food-truck-rodeo/page.tsx`

**Step 1: Rewrite to fetch from database**

Replace the static `FOOD_TRUCKS` array with a dynamic fetch:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'
```

Interface:

```typescript
interface FoodTruck {
  id: string
  business_name: string
  cuisine_type: string
  logo_url: string | null
  days: string[]
  website: string | null
  instagram: string | null
  facebook: string | null
}
```

Fetch on mount:

```typescript
const supabase = createClient()

const { data: event } = await supabase
  .from('events')
  .select('id')
  .eq('is_active', true)
  .single()

if (!event) { setLoading(false); return }

const { data } = await supabase
  .from('food_trucks')
  .select('id, business_name, cuisine_type, logo_url, days, website, instagram, facebook')
  .eq('event_id', event.id)
  .eq('is_published', true)
  .order('business_name')
```

**Step 2: Update the card grid**

Each card shows:
- Logo (if present, using Supabase storage public URL)
- Business name
- Cuisine type badge
- Day badges (Fri/Sat/Sun)
- Social links (instagram, facebook, website) as icon links

Keep the same Hours & Location section and Good to Know section from the existing page.

If no food trucks are published yet, show "Food truck lineup coming soon" message.

Keep same dark theme styling as existing page.

**Step 3: Commit**

```bash
git add src/app/events/food-truck-rodeo/page.tsx
git commit -m "feat: rewrite food truck page to fetch from database"
```

---

## Task 8: Verification

**Step 1: End-to-end test**

1. Run migration in Supabase SQL Editor
2. Navigate to `/admin/food-trucks` - see empty state
3. Add a food truck with logo, 2 days (Fri/Sat), no Thursday
4. Verify invoice created with amount = 12000 ($120)
5. Toggle published on
6. Navigate to `/events/food-truck-rodeo` - see the truck card
7. Add a second truck with Thursday - verify checkbox works
8. Add a third truck - verify Thursday checkbox disabled (max 2 reached)
9. Edit a truck - change days, verify invoice amount updates if pending
10. Delete a truck - verify gone from table and public page

**Step 2: Portal test**

1. In admin, set a food truck's `user_id` to a test user (manually in Supabase)
2. Log in as that test user → navigate to `/portal`
3. Verify food truck section appears with invoice
4. Edit profile fields → save → verify changes persist
5. Upload logo → verify it appears
6. Pay invoice via Stripe checkout → verify status updates

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: food truck feature complete"
```
