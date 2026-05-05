# AATC Payment Lifecycle Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing single-payment flow with a deposit-then-balance flow: applicants pay any amount ≥ 25% of total to claim their booth (becomes visible on the site), then any amount thereafter to chip away at the balance, with a final-due deadline of 2027-01-01 enforced by a nightly Vercel Cron sweep.

**Architecture:** Application status gains two terminal states (`expired`, `canceled`). Three new datetime columns on `applications` track approval timestamp and the two deadlines. Two new datetime columns on `invoices` snapshot when 25% and 100% milestones cross. The Stripe webhook updates the running `amount_paid` and sets the milestones; the create-checkout route enforces the 25% minimum on the first payment. A nightly `/api/cron/lifecycle-sweep` Vercel Cron job runs the deposit-timeout, final-payment-timeout, and reminder-email logic. RLS is updated so `/directory` only shows applications whose deposit milestone has fired.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres, Stripe (live), Resend, Vercel Cron.

**Pre-flight assumptions verified before writing this plan:**
- Plan 2 is shipped and live at https://aatc-platform.vercel.app
- 2027 event row exists, 267 booths seeded, qty + add_ons schema applied
- `applications.total_amount` holds the booked total in cents
- `invoices.amount_paid` exists and supports running totals (migration 010)
- Webhook at [api/webhooks/stripe/route.ts](src/app/api/webhooks/stripe/route.ts) already increments `amount_paid` from `metadata.pay_amount`
- Create-checkout route at [api/create-checkout/route.ts](src/app/api/create-checkout/route.ts) already accepts an `amount` param
- Application status enum currently has: `pending | approved | rejected | waitlisted`
- Invoice status enum currently has: `pending | paid | overdue | cancelled`
- Resend integration exists at [api/send-email/route.ts](src/app/api/send-email/route.ts) with templates for approve/reject/waitlist

**Out of scope (Plan 4):**
- Pre-load of returning customers via admin form
- `/portal/needs_roster` flow for pre-loaded returners
- Sponsor visibility gated on `final_paid_at`

---

### Task 1: Migration 022 — application lifecycle columns + status enum

**Files:**
- Create: `supabase/migrations/022_application_lifecycle.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify file content**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
cat supabase/migrations/022_application_lifecycle.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_application_lifecycle.sql
git commit -m "feat(db): migration 022 — application lifecycle columns + status enum

Extends application_status enum with 'expired' and 'canceled'. Adds
approved_at, deposit_due_at, final_due_at, needs_roster columns.
Indexes on the due_at columns scoped to status='approved' for the
nightly cron sweep."
```

---

### Task 2: Apply migration 022 to production Supabase

**Files:** none modified.

- [ ] **Step 1: Run the SQL in Supabase SQL Editor**

Open `https://supabase.com/dashboard/project/srlgjovefsmtkxthtjkz/sql/new`, paste the SQL from `022_application_lifecycle.sql`, click Run.

Expected: "Success. No rows returned." Postgres requires `ALTER TYPE ... ADD VALUE` to be run outside a multi-statement transaction OR before any statement that uses the new value — Supabase SQL Editor runs each top-level statement independently, so this works.

- [ ] **Step 2: Verify the new columns and enum values**

```sql
-- Verify columns
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'applications'
   and column_name in ('approved_at','deposit_due_at','final_due_at','needs_roster')
 order by column_name;

-- Verify enum values
select enumlabel
  from pg_enum
 where enumtypid = (select oid from pg_type where typname = 'application_status')
 order by enumsortorder;
```

Expected:
- 4 column rows: `approved_at`, `deposit_due_at`, `final_due_at` are timestamptz / nullable; `needs_roster` is boolean / NOT nullable.
- 6 enum rows: `pending, approved, rejected, waitlisted, expired, canceled`.

Paste the output back to confirm before Task 3.

No commit.

---

### Task 3: Migration 023 — invoice milestone columns

**Files:**
- Create: `supabase/migrations/023_invoice_milestones.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 023: Invoice milestone timestamps
-- Run after migration 022. Adds deposit_paid_at and final_paid_at,
-- which the webhook fires when amount_paid crosses 25% / 100%.
-- ============================================================

alter table invoices
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists final_paid_at timestamptz;

create index if not exists invoices_deposit_paid_at_idx
  on invoices (deposit_paid_at)
  where deposit_paid_at is not null;
```

- [ ] **Step 2: Apply and verify**

In Supabase SQL Editor, paste and run. Then:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'invoices'
   and column_name in ('deposit_paid_at','final_paid_at')
 order by column_name;
```

Expected: 2 timestamptz / nullable rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_invoice_milestones.sql
git commit -m "feat(db): migration 023 — invoice milestone timestamps

Adds deposit_paid_at and final_paid_at to invoices. Webhook sets these
when amount_paid crosses 25% / 100% of total."
```

---

### Task 4: Update Database TypeScript type for new columns

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add columns to `applications` Row, Insert, Update**

Open `src/types/database.ts`, find the `applications` block (Task 5 of Plan 2 added `artist_single_qty` etc. — same place). Add these to all three shapes:

In `Row`:
```ts
approved_at: string | null
deposit_due_at: string | null
final_due_at: string | null
needs_roster: boolean
```

Update the `status` literal-union to include the new values:
```ts
status: 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'expired' | 'canceled'
```

In `Insert` and `Update`: same fields, all optional with `?`. Same `status` union.

- [ ] **Step 2: Add columns to `invoices` Row, Insert, Update**

Find the `invoices` block, add:

In `Row`:
```ts
deposit_paid_at: string | null
final_paid_at: string | null
```

In `Insert` and `Update`: optional.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): lifecycle columns on applications + invoices

Applications: approved_at, deposit_due_at, final_due_at, needs_roster.
status enum extended with expired/canceled. Invoices: deposit_paid_at,
final_paid_at."
```

---

### Task 5: Add deposit-percentage helpers to pricing.ts

**Files:**
- Modify: `src/lib/pricing.ts`

- [ ] **Step 1: Add at the bottom of the file**

```ts
// 25% minimum first payment, rounded UP to integer cents (avoid pennies-short).
export const DEPOSIT_PERCENT = 0.25

export function minDepositCents(totalCents: number): number {
  if (totalCents <= 0) return 0
  return Math.ceil(totalCents * DEPOSIT_PERCENT)
}
```

- [ ] **Step 2: Verify**

```bash
npm run build 2>&1 | tail -3
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing.ts
git commit -m "feat(pricing): add minDepositCents helper

25% of total, ceil-rounded to cents. Used by the payment page and
create-checkout route to enforce the deposit minimum on first payment."
```

---

### Task 6: Update admin approval action to compute lifecycle dates + create invoice

**Files:**
- Modify: `src/app/admin/applications/page.tsx` — find the approval action

The current "Approve" button updates `applications.status` to `'approved'`. We need it to also:
1. Set `approved_at = now()`
2. Set `deposit_due_at = now() + 30 days`
3. Set `final_due_at = 2027-01-01 05:00 UTC` (= 2027-01-01 00:00 Eastern)
4. Create an `invoices` row if one doesn't exist, with `amount = applications.total_amount`, `status = 'pending'`, `amount_paid = 0`

- [ ] **Step 1: Find the approve handler**

```bash
grep -n "status: 'approved'\|approved'" src/app/admin/applications/page.tsx | head -5
```

Locate the function that handles the approve action.

- [ ] **Step 2: Replace the status update with the full lifecycle update**

Where the current code does something like:
```ts
await supabase.from('applications').update({ status: 'approved' }).eq('id', appId)
```

Replace with:

```ts
const FINAL_DUE_AT = '2027-01-01T05:00:00Z' // 2027-01-01 00:00 America/New_York

const now = new Date()
const depositDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

const { data: app, error: appErr } = await supabase
  .from('applications')
  .update({
    status: 'approved',
    approved_at: now.toISOString(),
    deposit_due_at: depositDueAt.toISOString(),
    final_due_at: FINAL_DUE_AT,
  })
  .eq('id', appId)
  .select('id, total_amount')
  .single()

if (appErr || !app) {
  toast.error('Failed to approve application')
  return
}

// Create invoice if not present
const { data: existing } = await supabase
  .from('invoices')
  .select('id')
  .eq('application_id', appId)
  .maybeSingle()

if (!existing) {
  const { error: invErr } = await supabase.from('invoices').insert({
    application_id: appId,
    amount: app.total_amount,
    amount_paid: 0,
    status: 'pending',
  })
  if (invErr) {
    toast.error('Approved, but failed to create invoice — fix manually in admin/invoices')
    return
  }
}
```

(Adapt to whatever the existing handler's variable naming and toast pattern is. Don't change the trigger of the email-on-approve — Task 9 updates the email template separately.)

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/applications/page.tsx
git commit -m "feat(admin): approval action sets lifecycle dates + creates invoice

approved_at = now(); deposit_due_at = +30d; final_due_at = 2027-01-01 ET.
Creates invoice if one doesn't exist."
```

---

### Task 7: Update approval email template to include deposit deadline

**Files:**
- Modify: `src/app/api/send-email/route.ts`

The existing `approvedEmail()` function takes `(businessName, exhibitorType, boothSize, totalAmount)`. We extend it to also receive the deposit deadline so the email tells the applicant when they need to pay 25% by.

- [ ] **Step 1: Update the function signature and body**

Find `function approvedEmail(...)` (around line 81) and add a `depositDueAt: string | null` parameter (ISO date string). In the email HTML, include a paragraph like:

```html
<p>To secure your booth, please pay at least 25% of the total
($<strong>{minDeposit}</strong>) by <strong>{depositDeadline}</strong>.
The remaining balance is due by <strong>January 1, 2027</strong>.
If the deposit is not received by the deadline, the booth will be
released to the next applicant.</p>
```

Use the existing helper `minDepositCents` from `@/lib/pricing` to compute `minDeposit` (display as dollars). Format `depositDueAt` for display (e.g., `new Date(depositDueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })`). If `depositDueAt` is null (e.g., legacy 2026 approvals), omit the deadline paragraph.

- [ ] **Step 2: Update the call site**

Around line 316 (was updated in Plan 2's Task 13–14 to use `describeBooths(app)`), the call currently looks like:

```ts
html = approvedEmail(app.business_name, app.exhibitor_type, describeBooths(app), app.total_amount)
```

Change to:

```ts
html = approvedEmail(
  app.business_name,
  app.exhibitor_type,
  describeBooths(app),
  app.total_amount,
  app.deposit_due_at,
)
```

Add `deposit_due_at` to the `select` query around line 300.

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/send-email/route.ts
git commit -m "feat(email): approval email includes deposit deadline + minimum

Tells applicant the 25% minimum amount and the 30-day deadline."
```

---

### Task 8: Update /api/create-checkout to enforce 25% minimum on first payment

**Files:**
- Modify: `src/app/api/create-checkout/route.ts`

The route currently accepts an `amount` param and validates `0 < payAmount <= balance`. We add: if `inv.deposit_paid_at` is null (first payment), `payAmount` must also be `>= minDepositCents(inv.amount)`.

- [ ] **Step 1: Update the select to include deposit_paid_at**

Around line 35:

```ts
const { data: inv } = await supabase
  .from('invoices')
  .select('id, amount, amount_paid, status, application_id, sponsorship_id, food_truck_id, deposit_paid_at')
  .eq('id', invoiceId)
  .single()
```

- [ ] **Step 2: Add minimum-deposit gate before the existing balance check**

Around line 51 (after computing `balance` and `payAmount`):

```ts
import { minDepositCents } from '@/lib/pricing'  // add this import at top of file

// ... existing balance + payAmount logic ...

// First-payment minimum: ≥ 25% of total
if (!inv.deposit_paid_at) {
  const minFirst = minDepositCents(inv.amount)
  if (payAmount < minFirst) {
    return NextResponse.json(
      { error: `First payment must be at least $${(minFirst / 100).toFixed(2)} (25% of $${(inv.amount / 100).toFixed(2)})` },
      { status: 400 },
    )
  }
}
```

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/create-checkout/route.ts
git commit -m "feat(api): create-checkout enforces 25% minimum on first payment

Reads invoices.deposit_paid_at to detect first-vs-subsequent payment;
first payment must be >= minDepositCents(invoice.amount)."
```

---

### Task 9: Update Stripe webhook to set milestone timestamps

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

When the webhook updates `amount_paid`, it now also fires `deposit_paid_at` (when `amount_paid` first crosses 25% of `amount`) and `final_paid_at` (when `amount_paid` reaches `amount`).

- [ ] **Step 1: Update the select to include the milestone columns**

Around line 51:

```ts
const { data: inv } = await supabase
  .from('invoices')
  .select('id, amount, amount_paid, status, deposit_paid_at, final_paid_at')
  .eq('id', invoiceId)
  .single()
```

- [ ] **Step 2: Add milestone logic to the update payload**

Around line 66, after computing `newAmountPaid` and `fullyPaid`, add:

```ts
import { minDepositCents } from '@/lib/pricing'  // add at top of file

// ... existing logic computing newAmountPaid + fullyPaid ...

const minDeposit = minDepositCents(inv.amount)
const justCrossedDeposit = !inv.deposit_paid_at && newAmountPaid >= minDeposit
const justCrossedFinal = !inv.final_paid_at && newAmountPaid >= inv.amount
const nowIso = new Date().toISOString()

const updateData: Record<string, unknown> = {
  amount_paid: newAmountPaid,
  stripe_payment_intent_id: paymentIntent,
}
if (justCrossedDeposit) {
  updateData.deposit_paid_at = nowIso
}
if (justCrossedFinal) {
  updateData.final_paid_at = nowIso
}
if (fullyPaid) {
  updateData.status = 'paid'
  updateData.paid_at = nowIso
}
```

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(webhook): set deposit_paid_at + final_paid_at milestones

When amount_paid crosses 25% threshold, set deposit_paid_at. When
amount_paid >= amount, set final_paid_at. Both are one-shot — only
fire if the timestamp wasn't already set."
```

---

### Task 10: Build the /portal/pay payment page

**Files:**
- Create: `src/app/portal/pay/page.tsx`

A logged-in applicant lands here with `?invoice=<id>`. Page shows invoice total, amount paid, balance remaining, an amount-input (defaults to remaining balance, with the 25% minimum enforced when no deposit yet), and a "Pay" button that posts to `/api/create-checkout`.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { minDepositCents } from '@/lib/pricing'
import toast from 'react-hot-toast'

interface InvoiceData {
  id: string
  amount: number
  amount_paid: number
  status: string
  deposit_paid_at: string | null
  final_paid_at: string | null
  application_id: string | null
  sponsorship_id: string | null
}

function PayContent() {
  const search = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const invoiceId = search.get('invoice')

  const [invoice, setInvoice] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [amountInput, setAmountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!invoiceId) { setLoading(false); return }
    supabase
      .from('invoices')
      .select('id, amount, amount_paid, status, deposit_paid_at, final_paid_at, application_id, sponsorship_id')
      .eq('id', invoiceId)
      .single()
      .then(({ data }) => {
        if (data) {
          setInvoice(data)
          const balance = data.amount - (data.amount_paid ?? 0)
          setAmountInput((balance / 100).toFixed(2))
        }
        setLoading(false)
      })
  }, [invoiceId, supabase])

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} /></div>
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm" style={{ color: '#999' }}>Invoice not found.</p>
        <Link href="/portal" className="mt-4 inline-block text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>
    )
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-semibold text-white">This invoice is {invoice.status}.</p>
        <Link href="/portal" className="mt-4 inline-block text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>
    )
  }

  const balance = invoice.amount - invoice.amount_paid
  const isFirstPayment = !invoice.deposit_paid_at
  const minimumCents = isFirstPayment ? minDepositCents(invoice.amount) : 100
  const amountCents = Math.round(parseFloat(amountInput || '0') * 100)
  const valid = amountCents >= minimumCents && amountCents <= balance

  const handlePay = async () => {
    if (!valid) {
      toast.error(
        isFirstPayment
          ? `First payment must be at least ${formatCurrency(minimumCents)}`
          : `Payment must be between $0.01 and ${formatCurrency(balance)}`,
      )
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invoice.id, amount: amountCents }),
    })
    const json = await res.json()
    if (json.url) {
      window.location.href = json.url
      return
    }
    toast.error(json.error ?? 'Failed to start checkout')
    setSubmitting(false)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <Link href="/portal" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Back to portal</Link>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <h1 className="font-display mb-4 text-2xl font-bold text-white">Make a payment</h1>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span style={{ color: '#999' }}>Total invoiced</span><span className="text-white">{formatCurrency(invoice.amount)}</span></div>
          <div className="flex justify-between"><span style={{ color: '#999' }}>Already paid</span><span className="text-white">{formatCurrency(invoice.amount_paid)}</span></div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: '#2a2a2a' }}><span className="font-semibold text-white">Balance due</span><span className="font-semibold" style={{ color: '#C4A882' }}>{formatCurrency(balance)}</span></div>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-white" htmlFor="amount">Amount to pay</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white" style={{ color: '#999' }}>$</span>
            <input
              id="amount"
              type="number"
              min={(minimumCents / 100).toFixed(2)}
              max={(balance / 100).toFixed(2)}
              step="0.01"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="w-full rounded-lg pl-7 pr-4 py-3 text-sm text-white outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
            />
          </div>
          <p className="mt-1 text-xs" style={{ color: '#999' }}>
            {isFirstPayment
              ? `Minimum first payment: ${formatCurrency(minimumCents)} (25%). Remaining balance is due by January 1, 2027.`
              : `Pay any amount up to ${formatCurrency(balance)}.`}
          </p>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={!valid || submitting}
          className="mt-6 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: '#8B7355' }}
        >
          {submitting ? 'Starting checkout…' : `Pay ${valid ? formatCurrency(amountCents) : ''}`}
        </button>
      </div>
    </div>
  )
}

export default function PayPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} /></div>}>
      <PayContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify build + route in route table**

```bash
npm run build 2>&1 | grep -E "/portal/pay|error" | head -5
```

Expected: see `○ /portal/pay` in the route table; no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/pay/page.tsx
git commit -m "feat(portal): /portal/pay partial-payment page

Fetches the invoice, shows total/paid/balance, lets the applicant enter
any amount with a 25% minimum on first payment. Submits to
/api/create-checkout and redirects to Stripe Checkout."
```

---

### Task 11: Update /portal to link to /portal/pay

**Files:**
- Modify: `src/app/portal/page.tsx`

Currently `/portal` likely has a "Pay Now" button that calls `/api/create-checkout` directly with the full balance. Replace it with a link to `/portal/pay?invoice=<id>` so the applicant lands on the new page and chooses an amount.

- [ ] **Step 1: Find the existing "Pay Now" button**

```bash
grep -n "create-checkout\|Pay Now\|pay-now" src/app/portal/page.tsx | head -10
```

- [ ] **Step 2: Replace direct fetch with a Link**

Wherever a button currently does `fetch('/api/create-checkout', ...)` for an invoice, replace with:

```tsx
import Link from 'next/link'

// in JSX:
<Link
  href={`/portal/pay?invoice=${invoice.id}`}
  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
  style={{ backgroundColor: '#8B7355' }}
>
  Pay
</Link>
```

(Adjust styling to match the existing button.)

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "feat(portal): Pay button links to /portal/pay instead of direct checkout"
```

---

### Task 12: Migration 024 — directory visibility RLS update

**Files:**
- Create: `supabase/migrations/024_directory_visibility.sql`

The current public-read policy (from migration 007) shows applications + assigned booths to anyone. We tighten it: an application is publicly visible only if its invoice has a `deposit_paid_at` set AND `needs_roster = false`.

- [ ] **Step 1: Inspect the existing policy**

In Supabase SQL Editor:

```sql
select policyname, cmd, qual
  from pg_policies
 where tablename in ('applications','exhibitors','booths')
 order by tablename, policyname;
```

Look at the `qual` column to see what the existing public-read condition is. The Plan 3 migration replaces or augments those.

- [ ] **Step 2: Write the migration**

```sql
-- ============================================================
-- Migration 024: Tighten public read policies — only show
-- exhibitors whose invoice deposit milestone has fired and who
-- have completed their roster (needs_roster = false).
-- ============================================================

-- Drop the existing public-read policy on applications (set up in 007).
-- Re-create it with the deposit + roster conditions.
drop policy if exists "Public can read approved applications" on applications;

create policy "Public can read deposit-paid applications"
  on applications for select
  using (
    status = 'approved'
    and needs_roster = false
    and exists (
      select 1 from invoices i
       where i.application_id = applications.id
         and i.deposit_paid_at is not null
    )
  );

-- Booths: only show booths assigned to deposit-paid applications.
drop policy if exists "Public can read assigned booths" on booths;

create policy "Public can read deposit-paid booths"
  on booths for select
  using (
    application_id is not null
    and exists (
      select 1 from applications a
       join invoices i on i.application_id = a.id
       where a.id = booths.application_id
         and a.status = 'approved'
         and a.needs_roster = false
         and i.deposit_paid_at is not null
    )
  );
```

(The exact policy names from migration 007 may differ. Run the inspection query in Step 1 first; if the policy names are different, use those names in the `drop policy if exists` statements.)

- [ ] **Step 3: Apply in Supabase SQL Editor**

Paste and run.

- [ ] **Step 4: Verify the new policies are in place**

```sql
select policyname, qual
  from pg_policies
 where policyname like 'Public can read deposit-paid%'
 order by policyname;
```

Expected: 2 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/024_directory_visibility.sql
git commit -m "feat(db): migration 024 — public read gated on deposit_paid_at + needs_roster

Drops the old 'approved-only' public-read policy on applications and
booths; re-creates with the additional check that the application's
invoice has deposit_paid_at set and needs_roster is false."
```

---

### Task 13: Update admin booth assignment to filter and sort by deposit time

**Files:**
- Modify: `src/app/admin/booths/page.tsx`

Admin assigns booth numbers from a queue. With the new flow, only deposit-paid applicants should appear, sorted by `deposit_paid_at ASC` (first-come-first-serve by deposit time).

- [ ] **Step 1: Update the applications query**

Find the supabase query that fetches the `apps` array. Add a join on `invoices` and filter:

```ts
const { data: apps } = await supabase
  .from('applications')
  .select(`
    id, business_name, contact_name, exhibitor_type, booth_size,
    artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty,
    corner_count, is_corner, artist_count, artists, artists_ids_later,
    invoices!inner(deposit_paid_at)
  `)
  .eq('status', 'approved')
  .not('invoices.deposit_paid_at', 'is', null)
  .order('invoices(deposit_paid_at)', { ascending: true })
```

(Adjust the existing `.select()` and add `.eq()` / `.not()` filters. The `!inner` join enforces that the application has a paid invoice. The order key may need tweaking — Postgres-via-PostgREST sometimes wants a different syntax; if the order doesn't take, sort client-side via `apps.sort((a, b) => new Date(a.invoices.deposit_paid_at).getTime() - new Date(b.invoices.deposit_paid_at).getTime())`.)

- [ ] **Step 2: Update the local `ApprovedApp` interface**

If the new query introduces a `deposit_paid_at` field via the join, add it to the interface so TypeScript is happy:

```ts
interface ApprovedApp {
  // ... existing fields ...
  invoices?: { deposit_paid_at: string | null } | null
}
```

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/booths/page.tsx
git commit -m "feat(admin): booth assignment queue filters to deposit-paid + sorts FCFS

Only applicants whose invoice has deposit_paid_at set appear in the
assignment queue, sorted by deposit_paid_at ascending."
```

---

### Task 14: Add lifecycle email templates (deposit reminder, final reminders, expiration, cancellation)

**Files:**
- Modify: `src/app/api/send-email/route.ts` — add 5 new template functions
- Modify: `src/app/api/send-email/route.ts` — extend the route to handle new template kinds via the `kind` body param

- [ ] **Step 1: Add 5 new template functions near the existing approvedEmail/rejectedEmail/etc.**

```ts
export function depositReminderEmail(businessName: string, depositDueAt: string, minDeposit: number, balance: number, payUrl: string) {
  const dueDate = new Date(depositDueAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return `<!DOCTYPE html><html><body style="font-family: Inter, system-ui, sans-serif; background:#0a0a0a; color:#fff; padding:24px;">
    <h1 style="color:#C4A882;">Reminder: deposit due ${dueDate}</h1>
    <p>Hi ${businessName},</p>
    <p>Your AATC 2027 booth is still being held but your <strong>25% deposit hasn't been received yet</strong>. The deadline is <strong>${dueDate}</strong> — if we don't have it by then, the booth is released to the next applicant.</p>
    <p>Minimum deposit: <strong>$${(minDeposit / 100).toFixed(2)}</strong> (or any amount up to the full $${(balance / 100).toFixed(2)} balance).</p>
    <p><a href="${payUrl}" style="display:inline-block; background:#8B7355; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none;">Pay now</a></p>
  </body></html>`
}

export function finalReminderEmail(businessName: string, daysRemaining: number, balance: number, payUrl: string) {
  return `<!DOCTYPE html><html><body style="font-family: Inter, system-ui, sans-serif; background:#0a0a0a; color:#fff; padding:24px;">
    <h1 style="color:#C4A882;">${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to pay your balance</h1>
    <p>Hi ${businessName},</p>
    <p>Your AATC 2027 booth balance of <strong>$${(balance / 100).toFixed(2)}</strong> is due by <strong>January 1, 2027</strong>. ${daysRemaining === 1 ? 'This is your final reminder — payment is due tomorrow.' : `That's ${daysRemaining} days from now.`}</p>
    <p>If the balance isn't paid by January 1, the booth will be canceled and your deposit will be forfeited.</p>
    <p><a href="${payUrl}" style="display:inline-block; background:#8B7355; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none;">Pay balance</a></p>
  </body></html>`
}

export function expirationEmail(businessName: string) {
  return `<!DOCTYPE html><html><body style="font-family: Inter, system-ui, sans-serif; background:#0a0a0a; color:#fff; padding:24px;">
    <h1 style="color:#f87171;">Your AATC 2027 booth has been released</h1>
    <p>Hi ${businessName},</p>
    <p>Unfortunately, the 25% deposit deadline passed without payment, so your booth has been released to the next applicant on the list.</p>
    <p>If you'd still like to be part of AATC 2027, please reapply at <a href="https://aatc-platform.vercel.app/apply" style="color:#C4A882;">aatc-platform.vercel.app/apply</a> — pending availability.</p>
  </body></html>`
}

export function cancellationEmail(businessName: string, depositForfeited: number) {
  return `<!DOCTYPE html><html><body style="font-family: Inter, system-ui, sans-serif; background:#0a0a0a; color:#fff; padding:24px;">
    <h1 style="color:#f87171;">Your AATC 2027 booth has been canceled</h1>
    <p>Hi ${businessName},</p>
    <p>The January 1, 2027 deadline for the remaining balance has passed. Per the terms accepted at deposit, the booth has been canceled and the deposit ($${(depositForfeited / 100).toFixed(2)}) is forfeited.</p>
    <p>If you have questions, please reply to this email.</p>
  </body></html>`
}
```

- [ ] **Step 2: Extend the route's request handler to accept new `kind` values**

Find the section that reads request body. The current handler probably has `if (status === 'approved')` etc. Refactor to accept a `kind` param that selects the template:

```ts
const body = await req.json() as {
  kind?: 'approved' | 'rejected' | 'waitlisted' | 'deposit_reminder' | 'final_reminder' | 'expiration' | 'cancellation'
  applicationId?: string
  status?: string  // legacy, mapped to kind
  daysRemaining?: number  // for final_reminder
}
```

Map the legacy `status` param to a `kind`. Then dispatch on `kind` to pick the right template + select the right fields from the application row. For `deposit_reminder` and `final_reminder`, also fetch the related invoice to get balance and payUrl.

(Read the existing route logic before editing — preserve all existing behavior; only ADD the new branches.)

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/send-email/route.ts
git commit -m "feat(email): lifecycle templates — deposit/final reminders, expiration, cancellation

Adds depositReminderEmail, finalReminderEmail, expirationEmail,
cancellationEmail. Route accepts a kind param to dispatch."
```

---

### Task 15: Build the lifecycle-sweep cron endpoint

**Files:**
- Create: `src/app/api/cron/lifecycle-sweep/route.ts`

This endpoint runs nightly (via Vercel Cron) and:
1. Finds approved applications where `deposit_due_at < now()` and the invoice has no `deposit_paid_at` → set status to `expired`, free the booth assignment, send expiration email.
2. Finds approved applications where `final_due_at < now()` and the invoice has no `final_paid_at` → set status to `canceled`, free the booth, send cancellation email.
3. Finds approved applications whose `deposit_due_at` is **7 days from now** and no deposit yet → send deposit-reminder email.
4. Finds approved applications whose `final_due_at` is **30/14/7/1 days from now** and no final yet → send final-reminder email.

- [ ] **Step 1: Create the file**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { minDepositCents } from '@/lib/pricing'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aatc-platform.vercel.app'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MS_TOLERANCE = 12 * 60 * 60 * 1000  // ± 12h window for "exactly N days from now" matches

function adminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function sendEmail(kind: string, applicationId: string, extra: Record<string, unknown> = {}) {
  await fetch(`${SITE_URL}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Use the cron secret as auth — see Task 16 for setting CRON_SECRET
      'x-cron-secret': process.env.CRON_SECRET ?? '',
    },
    body: JSON.stringify({ kind, applicationId, ...extra }),
  })
}

export async function GET(req: Request) {
  // Vercel Cron passes a secret header. In development you can also call
  // this manually with the same secret.
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = adminSupabase()
  const now = new Date()
  const summary: Record<string, number> = { expired: 0, canceled: 0, deposit_reminders: 0, final_reminders: 0 }

  // ── 1. Expire un-deposited applications past deposit_due_at ──
  const { data: toExpire } = await supabase
    .from('applications')
    .select('id, business_name, invoices!inner(id, deposit_paid_at)')
    .eq('status', 'approved')
    .lt('deposit_due_at', now.toISOString())
    .is('invoices.deposit_paid_at', null)

  for (const app of toExpire ?? []) {
    await supabase.from('applications').update({ status: 'expired' }).eq('id', app.id)
    await supabase.from('booths').update({ application_id: null, status: 'available' }).eq('application_id', app.id)
    await sendEmail('expiration', app.id)
    summary.expired++
  }

  // ── 2. Cancel un-final-paid applications past final_due_at ──
  const { data: toCancel } = await supabase
    .from('applications')
    .select('id, invoices!inner(id, final_paid_at, amount_paid)')
    .eq('status', 'approved')
    .lt('final_due_at', now.toISOString())
    .is('invoices.final_paid_at', null)

  for (const app of toCancel ?? []) {
    const inv = (app.invoices as unknown as { id: string; amount_paid: number })
    await supabase.from('applications').update({ status: 'canceled' }).eq('id', app.id)
    await supabase.from('booths').update({ application_id: null, status: 'available' }).eq('application_id', app.id)
    await sendEmail('cancellation', app.id, { depositForfeited: inv.amount_paid ?? 0 })
    summary.canceled++
  }

  // ── 3. Deposit reminder: 7 days before deposit_due_at, no deposit ──
  const reminderTarget = new Date(now.getTime() + 7 * ONE_DAY_MS)
  const reminderLow = new Date(reminderTarget.getTime() - MS_TOLERANCE).toISOString()
  const reminderHigh = new Date(reminderTarget.getTime() + MS_TOLERANCE).toISOString()

  const { data: toRemindDeposit } = await supabase
    .from('applications')
    .select('id, invoices!inner(deposit_paid_at)')
    .eq('status', 'approved')
    .gte('deposit_due_at', reminderLow)
    .lte('deposit_due_at', reminderHigh)
    .is('invoices.deposit_paid_at', null)

  for (const app of toRemindDeposit ?? []) {
    await sendEmail('deposit_reminder', app.id)
    summary.deposit_reminders++
  }

  // ── 4. Final-payment reminders: 30 / 14 / 7 / 1 days before final_due_at ──
  for (const daysOut of [30, 14, 7, 1]) {
    const target = new Date(now.getTime() + daysOut * ONE_DAY_MS)
    const low = new Date(target.getTime() - MS_TOLERANCE).toISOString()
    const high = new Date(target.getTime() + MS_TOLERANCE).toISOString()

    const { data: toRemindFinal } = await supabase
      .from('applications')
      .select('id, invoices!inner(final_paid_at)')
      .eq('status', 'approved')
      .gte('final_due_at', low)
      .lte('final_due_at', high)
      .is('invoices.final_paid_at', null)

    for (const app of toRemindFinal ?? []) {
      await sendEmail('final_reminder', app.id, { daysRemaining: daysOut })
      summary.final_reminders++
    }
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), summary })
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build 2>&1 | grep -E "/api/cron/lifecycle-sweep|error" | head -5
```

Expected: route appears in build output as `ƒ /api/cron/lifecycle-sweep`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/lifecycle-sweep/route.ts
git commit -m "feat(cron): lifecycle-sweep endpoint for deposit/final timeouts + reminders

Bearer-token-protected. Expires un-deposited applications past 30 days,
cancels un-final-paid past Jan 1, and sends T-7 deposit + T-30/14/7/1
final reminder emails. Frees booth assignments on expire/cancel."
```

---

### Task 16: Configure Vercel Cron + secrets

**Files:**
- Create: `vercel.json` (or modify if it already exists)

- [ ] **Step 1: Create the cron secret locally**

```bash
openssl rand -hex 32
```

Copy the 64-character hex string. We use it as the bearer token.

- [ ] **Step 2: Push the secret to Vercel production**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
printf '<paste-hex-from-step-1>' | vercel env add CRON_SECRET production
```

Also add it to your local `.env.local` so dev can hit the endpoint:

```bash
echo 'CRON_SECRET=<paste-hex-from-step-1>' >> .env.local
```

- [ ] **Step 3: Create `vercel.json` to register the cron**

```json
{
  "crons": [
    {
      "path": "/api/cron/lifecycle-sweep",
      "schedule": "0 9 * * *"
    }
  ]
}
```

(`0 9 * * *` = 9 AM UTC = 4 AM Eastern. Adjust if you prefer a different time.)

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "chore(vercel): register nightly lifecycle-sweep cron

9 AM UTC (4 AM Eastern) daily. Hits /api/cron/lifecycle-sweep with the
CRON_SECRET bearer token."
```

---

### Task 17: Add cron-secret check to /api/send-email so the cron can call it

**Files:**
- Modify: `src/app/api/send-email/route.ts`

The send-email route currently requires admin auth. The cron endpoint calls it with an `x-cron-secret` header — extend the auth check to accept that secret.

- [ ] **Step 1: Find the existing auth gate**

Look near the top of the POST handler — there should be a check that the caller is an admin (via Supabase session). Add a fast-path that accepts the cron secret:

```ts
// Allow trusted cron callers via shared secret
const cronSecret = req.headers.get('x-cron-secret')
const isCronCaller = !!cronSecret && cronSecret === process.env.CRON_SECRET

if (!isCronCaller) {
  // existing admin-auth check stays here
  // ...
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/app/api/send-email/route.ts
git commit -m "feat(email): accept x-cron-secret header so the lifecycle cron can send mail"
```

---

### Task 18: Local + production smoke of lifecycle-sweep

**Files:** none modified.

- [ ] **Step 1: Run locally against the local dev server**

```bash
# Terminal 1
cd /Users/ryanharrell/Documents/aatc-platform
npm run dev
```

```bash
# Terminal 2
curl -s -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/lifecycle-sweep
```

Expected JSON response: `{ "ok": true, "ranAt": "...", "summary": { "expired": 0, "canceled": 0, "deposit_reminders": 0, "final_reminders": 0 } }`. With no test data in the DB the counts should all be 0.

- [ ] **Step 2: Force a record into expired state to test**

In Supabase SQL Editor, take an existing approved test application and rewind its dates:

```sql
update applications
   set deposit_due_at = now() - interval '1 day',
       approved_at = now() - interval '31 days'
 where id = '<test-application-id>'
   and status = 'approved'
returning id, status, deposit_due_at;
```

Then re-run the curl from Step 1. Expected: `summary.expired = 1`. Verify in SQL:

```sql
select id, status from applications where id = '<test-application-id>';
-- Expected: status = 'expired'
```

Reset the test row to `pending` afterward so it doesn't pollute prod.

- [ ] **Step 3: Production deploy + cron verification**

```bash
git push origin develop
vercel --prod --yes
```

After deploy, trigger the cron manually:

```bash
curl -s -H "Authorization: Bearer <CRON_SECRET>" https://aatc-platform.vercel.app/api/cron/lifecycle-sweep
```

Expected: same JSON response with all-zero counts (assuming no real expirations yet).

In Vercel dashboard → Project → Settings → Cron Jobs, verify the job is registered and shows the next scheduled run.

No commit (no local file changes).

---

### Task 19: Plan 3 success criteria verification

**Files:**
- Modify: `docs/deployment.md` (mark Plan 3 complete)

- [ ] **Step 1: Walk the criteria**

- [ ] Migrations 022, 023, 024 applied to production Supabase
- [ ] application_status enum has 6 values (`pending, approved, rejected, waitlisted, expired, canceled`)
- [ ] `applications.approved_at`, `deposit_due_at`, `final_due_at`, `needs_roster` exist
- [ ] `invoices.deposit_paid_at`, `final_paid_at` exist
- [ ] Public `/directory` only shows applications with `deposit_paid_at IS NOT NULL`
- [ ] Approving an application sets the lifecycle dates and creates an invoice
- [ ] `/portal/pay?invoice=<id>` loads, shows balance, lets user enter any amount
- [ ] First payment < 25% returns a 400 error from `/api/create-checkout`
- [ ] Stripe webhook sets `deposit_paid_at` and `final_paid_at` correctly
- [ ] `/admin/booths` queue only shows deposit-paid applicants, sorted by `deposit_paid_at`
- [ ] Vercel Cron registered for `/api/cron/lifecycle-sweep`, daily 9 AM UTC
- [ ] Manual cron invocation returns `{ ok: true }`
- [ ] Forcing a record into expired state via SQL + re-running the cron flips status to `expired`

- [ ] **Step 2: Mark Plan 3 done in runbook**

```bash
# Edit docs/deployment.md, find the "Plans status" block, change:
#   - **Plan 3 — payment lifecycle ...:** drafted in spec, plan not yet written
# to:
#   - **Plan 3 — payment lifecycle ...:** ✅ complete (<DATE>)
git add docs/deployment.md
git commit -m "docs: mark Plan 3 complete"
git push origin develop
```

---

## Notes for the executing agent

- Schema migrations are touchy; apply them to production Supabase one at a time and verify each before moving on. The Plan 1+2 experience showed that Supabase SQL Editor does not wrap a script in a transaction, so partial-success states are possible.
- Postgres requires `ALTER TYPE ADD VALUE` to commit before the new value is used. The migration in Task 1 adds the values without using them, so it's safe — but if you ever combine an enum extension with a SELECT on the new value in the same statement, split it.
- The cron endpoint's `Authorization: Bearer ...` is what Vercel Cron itself sends (Vercel injects the bearer token from the project's `CRON_SECRET` env var automatically). Manual testing uses the same header.
- **Keep the deposit / final webhook updates idempotent.** Stripe will retry deliveries; the milestone columns must only fire once. The implementation pattern `if (!inv.deposit_paid_at && newAmountPaid >= minDeposit) → set deposit_paid_at` already handles this — don't change it to a blind `set deposit_paid_at = now()`.
- Don't touch the existing `paid_at` and `status='paid'` legacy invoice fields — keep them flowing alongside the new milestone columns. Other parts of the code (admin/invoices) still rely on `status` and `paid_at`.
- For the email template kind dispatch in Task 14, if the existing route already uses the `status` param to dispatch, just ADD branches for the new kinds — don't refactor the legacy routing.

## Dependencies on user

- Apply migrations 022, 023, 024 in Supabase SQL Editor (Tasks 2, 3, 12)
- Generate and stash `CRON_SECRET` (Task 16)
- Manually verify Vercel Cron registration in dashboard (Task 18)
- Decide whether 9 AM UTC is OK for the cron, or if the user wants a different schedule (Task 16)

## Out of scope (Plan 4)

- `/admin/import-returning` form for pre-loading 2026 returners
- `/portal/needs_roster=true` branch (roster-completion form)
- Sponsor visibility gated on `final_paid_at`
- Email template polish (current templates are functional; visual polish is Plan 4)
- Stripe webhook event-list trim (still listening to 7 events; only `checkout.session.completed` is needed)
- Visual / responsive polish of the `/portal/pay` page
- Lint cleanup of pre-existing 17 errors
- Resend custom from-domain verification
