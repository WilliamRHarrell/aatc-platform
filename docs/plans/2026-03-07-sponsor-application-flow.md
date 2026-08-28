# Sponsor Application Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public sponsor application form, admin approval with email, and sponsor portal for invoice payment and profile management.

**Architecture:** Extend the existing `sponsorships` table with contact/auth fields. Public form at `/apply/sponsor` inserts pending rows. Admin approves from `/admin/sponsorships` which creates invoices and sends email. Portal page detects sponsor users via `user_id` on the sponsorships table and shows sponsor-specific UI.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Auth + Storage), Resend email, Stripe checkout (existing), react-hot-toast

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/013_sponsor_application_fields.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2:** User runs migration in Supabase SQL Editor.

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Update sponsorships type**

Add to `sponsorships` Row:
```typescript
contact_name: string | null
email: string | null
phone: string | null
instagram: string | null
facebook: string | null
notes: string | null
user_id: string | null
```

Add to `sponsorships` Insert (all optional):
```typescript
contact_name?: string | null
email?: string | null
phone?: string | null
instagram?: string | null
facebook?: string | null
notes?: string | null
user_id?: string | null
```

Add to `sponsorships` Update (all optional):
```typescript
contact_name?: string | null
email?: string | null
phone?: string | null
instagram?: string | null
facebook?: string | null
notes?: string | null
user_id?: string | null
```

---

### Task 3: Sponsor Application Form Page

**Files:**
- Create: `src/app/apply/sponsor/page.tsx`

**Step 1: Build the form page**

Public page (no auth required). Uses the same dark theme and input styling as the artist/vendor application forms. Single-page form with these fields:

- Company/Sponsor name (required)
- Contact name (required)
- Email (required)
- Phone (optional)
- Website (optional)
- Instagram (optional)
- Facebook (optional)
- Preferred sponsorship tier - visual tier picker using TIER_INFO from the admin page with all 10 tiers split into Main Tiers and Individual Items
- Logo upload (optional) - upload to `exhibitor-media/sponsors/` bucket
- Notes/message textarea (optional)

On submit:
1. Upload logo if provided → get public URL
2. Insert into `sponsorships` table: `{ event_id, sponsor_name, contact_name, email, phone, website, instagram, facebook, tier, amount: TIER_INFO[tier].amount, logo_url, notes, status: 'pending' }`
3. Need to fetch active event first: `supabase.from('events').select('id').eq('is_active', true).single()`
4. Show success screen with "Thank you! We'll review your application and contact you at [email]."

Use `PublicNav` component at top (same as sponsors page).

**Key references:**
- Input styling: copy `inputClass()`, `inputStyle()`, `onFocusGold`, `onBlurGray` from `src/app/apply/artist/page.tsx:49-60`
- Tier picker: copy tier buttons from `src/app/admin/sponsorships/page.tsx:273-316`
- TIER_INFO constant: copy from `src/app/admin/sponsorships/page.tsx:23-34`
- Logo upload pattern: copy from `src/app/admin/sponsorships/page.tsx:130-139`
- PublicNav: `import PublicNav from '@/components/PublicNav'`

---

### Task 4: Update Public Sponsors Page

**Files:**
- Modify: `src/app/sponsors/page.tsx`

**Step 1: Add social links to sponsor display**

Update the query to include the new fields:
```typescript
.select('id, sponsor_name, tier, logo_url, website, amount, instagram, facebook')
```

Update the `Sponsor` interface to include `instagram` and `facebook`.

In the sponsor card, add social links below the sponsor name:
- Instagram icon + handle (if set)
- Facebook icon + link (if set)
- Website already shown

**Step 2: Update CTA section**

Replace the email CTA at the bottom with a link to the application form:
```tsx
<Link
  href="/apply/sponsor"
  className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
  style={{ backgroundColor: '#8B7355' }}
>
  Apply for Sponsorship
</Link>
```

Import `Link` from `next/link`.

---

### Task 5: Update Admin Sponsorships Page

**Files:**
- Modify: `src/app/admin/sponsorships/page.tsx`

**Step 1: Update Sponsorship interface and data fetching**

Add to `Sponsorship` interface:
```typescript
contact_name: string | null
email: string | null
phone: string | null
instagram: string | null
facebook: string | null
notes: string | null
user_id: string | null
```

**Step 2: Update the add/edit form**

Add `contact_name`, `email`, `phone`, `instagram`, `facebook`, `notes` fields to `FormState` and `EMPTY_FORM`. Add corresponding input fields in `renderForm()`.

Update `startEdit()` to populate these new fields.

Update `handleSave()` to include new fields in insert/update.

**Step 3: Show contact info in sponsor list rows**

In each sponsor row, below the tier/amount line, show:
```tsx
{s.email && (
  <p className="text-xs" style={{ color: '#666' }}>{s.contact_name} · {s.email}</p>
)}
```

**Step 4: Add Approve button for pending sponsors**

For sponsors with `status === 'pending'`, show an "Approve" button that:
1. Updates `sponsorships` status to `confirmed`
2. Creates an invoice via `supabase.from('invoices').insert({ sponsorship_id: s.id, amount: s.amount, status: 'pending' })`
3. Sends approval email via `fetch('/api/send-email', { method: 'POST', body: JSON.stringify({ sponsorshipId: s.id, status: 'approved' }) })`
4. Updates local state

The button goes in the actions area, styled green like the "Record Payment" button on invoices:
```tsx
style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
```

---

### Task 6: Add Sponsor Approval Email Template

**Files:**
- Modify: `src/app/api/send-email/route.ts`

**Step 1: Add sponsorApprovedEmail function**

```typescript
function sponsorApprovedEmail(sponsorName: string, tier: string, amount: number) {
  const dollars = (amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const tierLabel = tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#ffd700;">
      Sponsorship Confirmed
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Welcome Aboard, ${sponsorName}!
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Your <strong style="color:#ffffff;">${tierLabel}</strong> sponsorship for AATC 2027 has been confirmed.
      Thank you for supporting our tattooed military community!
    </p>
    <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-radius:12px; padding:20px 24px; margin:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; color:#999999; padding-bottom:8px;">Sponsorship level</td>
          <td align="right" style="font-size:13px; font-weight:600; color:#ffffff; padding-bottom:8px;">${tierLabel}</td>
        </tr>
        <tr>
          <td style="font-size:13px; color:#999999; border-top:1px solid #2a2a2a; padding-top:8px;">Invoice total</td>
          <td align="right" style="font-size:16px; font-weight:700; color:#C4A882; border-top:1px solid #2a2a2a; padding-top:8px;">${dollars}</td>
        </tr>
      </table>
    </div>
    <p style="margin:16px 0; font-size:15px; line-height:1.7; color:#cccccc;">
      To view your invoice and complete payment, create your account using the email address you applied with:
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${SITE_URL}/auth/login?redirect=/portal"
         style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none;
                font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px;
                border-radius:10px;">
        Create Account & View Invoice →
      </a>
    </p>
    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Questions? Reply to this email or contact us at
      <a href="mailto:info@allamericantattooconvention.com" style="color:#8B7355;">info@allamericantattooconvention.com</a>
    </p>
  `)
}
```

**Step 2: Update the POST handler**

Accept either `{ applicationId, status }` (existing) or `{ sponsorshipId, status }` (new).

Add a branch after the existing application logic:

```typescript
if (sponsorshipId) {
  const { data: spon } = await supabase
    .from('sponsorships')
    .select('sponsor_name, email, tier, amount')
    .eq('id', sponsorshipId)
    .single()

  if (!spon || !spon.email) {
    return NextResponse.json({ error: 'Sponsorship not found or no email' }, { status: 404 })
  }

  const subject = `🎉 Your AATC 2027 sponsorship is confirmed - ${spon.sponsor_name}`
  const html = sponsorApprovedEmail(spon.sponsor_name, spon.tier, spon.amount)

  const { error } = await resend.emails.send({
    from: FROM,
    to: spon.email,
    subject,
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

### Task 7: Update Portal Page for Sponsors

**Files:**
- Modify: `src/app/portal/page.tsx`

**Step 1: Add sponsor state and detection**

Add a `Sponsorship` interface:
```typescript
interface Sponsorship {
  id: string
  sponsor_name: string
  tier: string
  amount: number
  status: 'pending' | 'confirmed' | 'cancelled'
  website: string | null
  instagram: string | null
  facebook: string | null
  logo_url: string | null
  contact_name: string | null
  email: string | null
}
```

Add state: `const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null)`

**Step 2: Update the load function**

After checking for `application`, also check for a sponsorship:

```typescript
// Check if user is a sponsor
const { data: sponData } = await supabase
  .from('sponsorships')
  .select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

if (sponData) {
  setSponsorship(sponData as unknown as Sponsorship)
  // Fetch sponsor invoice
  const { data: sponInvoice } = await supabase
    .from('invoices')
    .select('id, amount, amount_paid, status, due_date, paid_at')
    .eq('sponsorship_id', sponData.id)
    .single()
  if (sponInvoice) setInvoice(sponInvoice as Invoice)
}
```

If no application AND no sponsorship found, try to auto-link by email:

```typescript
if (!app && !sponData) {
  // Try to link sponsor by email
  const { data: emailMatch } = await supabase
    .from('sponsorships')
    .select('id')
    .eq('email', user.email)
    .eq('status', 'confirmed')
    .is('user_id', null)
    .single()

  if (emailMatch) {
    // Link this user to the sponsorship
    await supabase
      .from('sponsorships')
      .update({ user_id: user.id })
      .eq('id', emailMatch.id)

    // Reload to pick up the sponsorship
    window.location.reload()
    return
  }
}
```

**Step 3: Add sponsor portal UI**

After the `{application && (...)}` block, add a `{sponsorship && (...)}` block that shows:

1. **Header** - "My Sponsorship" heading with sponsor name, tier badge
2. **Status card** - "Sponsorship Confirmed" (green) or "Pending Review" (yellow)
3. **Invoice & Payment** - Reuse the exact same invoice/payment card from the exhibitor section. The `invoice` and `handlePay` logic already works since invoice was loaded above.
4. **Sponsor Profile card** - Editable fields: website, instagram, facebook. Logo upload button. Save button that updates sponsorships table.
5. **Sponsorship Details card** - Read-only: tier, amount, contact name, email

Use the same `Card` and `SectionLabel` components already defined in the file.

**Step 4: Update the "no application" block**

Currently shows "Apply as Artist / Apply as Vendor". Update to also check for no sponsorship:

```tsx
{!application && !sponsorship && (
  <Card>
    <p className="mb-4 text-sm" style={{ color: '#999' }}>
      You haven&apos;t submitted an application yet.
    </p>
    <div className="flex flex-wrap gap-3">
      <Link href="/apply/artist" ...>Apply as Artist</Link>
      <Link href="/apply/vendor" ...>Apply as Vendor</Link>
      <Link href="/apply/sponsor" ...>Apply as Sponsor</Link>
    </div>
  </Card>
)}
```

---

### Task 8: Update Sponsor Form on Admin Page

**Files:**
- Modify: `src/app/admin/sponsorships/page.tsx`

Update the admin add/edit form to include the new contact fields (contact_name, email, phone, instagram, facebook, notes) so admins can also manually enter sponsors with full contact info. These fields should appear in a "Contact Information" section of the form.

---

### Verification Checklist

1. Go to `/sponsors` - see confirmed sponsors with social links, "Apply for Sponsorship" button
2. Click "Apply for Sponsorship" → `/apply/sponsor` form loads
3. Fill out form, submit → success message, row appears in `sponsorships` table with status `pending`
4. Go to `/admin/sponsorships` → see new pending sponsor with contact info
5. Click "Approve" → status changes to `confirmed`, invoice created, email sent
6. Check email → approval email received with "Create Account" link
7. Click link → create account at `/auth/login`
8. Go to `/portal` → sponsorship auto-linked by email, shows sponsor dashboard
9. Pay invoice via Stripe → payment recorded, balance updates
10. Upload logo from portal → logo appears on public sponsors page
