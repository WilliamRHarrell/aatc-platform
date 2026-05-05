# AATC Returner Pre-Load + Sponsor Visibility Implementation Plan (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin tooling to pre-load 2026 returning customers (paid offline at 2026 pricing) into the platform, give them a portal flow to complete their artist roster, gate sponsor public visibility on full payment, expose change-password navigation, and add an admin "reset user password" action.

**Architecture:** A new admin-only page at `/admin/import-returning` calls the Supabase Auth Admin API to create users with auto-confirmed emails, inserts pre-paid invoices, marks the application `needs_roster=true` so the portal shows a "complete your roster" form instead of the normal status card. On roster completion, an `exhibitors` row is created and `needs_roster` flips false — public visibility opens. Sponsors get a new RLS policy that requires `final_paid_at` on at least one linked invoice, mirroring how booth visibility works but with a stricter "paid in full" gate (vs booth's "deposit paid"). Two small additions: a "Change password" link in the portal nav and an admin action to reset a user's password directly via the Auth Admin API.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres, Auth Admin API), Stripe.

**Pre-flight assumptions verified before writing this plan:**
- Plans 1, 2, 3 are shipped and live at https://aatc-platform.vercel.app
- `applications.needs_roster` column exists (added in migration 022, default `false`)
- `invoices` already supports the deposit/final milestones from migration 023
- The existing sponsor public-read RLS policy is named `"Public can read featured footer sponsors"` (from migration 019) and uses `featured_footer = true AND status = 'confirmed'`
- The `/auth/reset-password` page already works for logged-in users (built in Plan 1) — Plan 4 just exposes it via navigation
- Auth Admin API recipes are documented in [docs/deployment.md](docs/deployment.md) — Plan 4 reuses the same `SUPABASE_SERVICE_ROLE_KEY` mechanism
- Migration 015 made `applications.user_id` nullable, so admin-created applications without a user are valid (Plan 4 *does* create users, but the path could fail and we want a fallback)

**Out of scope:**
- Email-template visual polish (current templates work; tweak in a future polish pass if desired)
- Resend custom from-domain (deferred to domain cutover)
- Supabase Site URL fix (user-driven dashboard config, see runbook)
- Lint cleanup of pre-existing 17 errors (separate code-quality plan)
- Multi-row CSV upload for returners (one-row admin form is sufficient for the ~10–50 expected records)

---

### Task 1: Build /admin/import-returning page

**Files:**
- Create: `src/app/admin/import-returning/page.tsx`

A logged-in admin lands here, fills in one returner's basic info, and clicks "Create." The handler:
1. Calls the Auth Admin API to create a Supabase auth user with `email_confirm: true` (no confirmation email sent).
2. Updates `profiles.role` (will be `public` — that's fine; only `ryan` and `malia` are admins per the runbook).
3. Inserts an `applications` row with `status='approved'`, `needs_roster=true`, `approved_at=now()`, all qty fields populated, `total_amount` = the amount paid offline, lifecycle dates set (deposit_due_at and final_due_at don't matter for paid-in-full rows but populate them anyway for consistency with normal approvals).
4. Inserts an `invoices` row with `amount = total`, `amount_paid = total`, `status='paid'`, `paid_at=now()`, `deposit_paid_at=now()`, `final_paid_at=now()` (so the cron sweep doesn't pick them up and so they pass the visibility RLS).
5. Triggers a launch email via the existing `/api/send-email` route with a new `kind='returner_invite'` (Task 2 adds the template).

The auth-admin call needs to happen server-side because it requires the service role key. We'll route the form's submit through a new API endpoint at `/api/admin/import-returning` that the form posts to. The endpoint:
- Verifies the caller is an admin via the Supabase session
- Calls the Auth Admin API
- Inserts the rows
- Returns the new user_id so the form can show success

- [ ] **Step 1: Create the admin API route**

Path: `src/app/api/admin/import-returning/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const FINAL_DUE_AT = '2027-01-01T05:00:00Z'

interface ImportPayload {
  email: string
  full_name: string
  phone: string
  exhibitor_type: 'artist' | 'vendor'
  artist_single_qty: number
  artist_double_qty: number
  vendor_single_qty: number
  vendor_double_qty: number
  corner_count: number
  total_amount_cents: number
  notes: string
  artist_count: number
}

export async function POST(req: Request) {
  // Auth check — caller must be an admin
  const cookieStore = await cookies()
  const userClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as ImportPayload
  if (!body.email || !body.full_name || body.total_amount_cents <= 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Service-role client bypasses RLS for the admin operations
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. Create auth user (auto-confirmed; magic-link signup later)
  // Generate a random temporary password — user resets it via /auth/reset-password.
  const tempPassword = crypto.randomUUID() + crypto.randomUUID()
  const { data: authResult, error: authErr } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: body.full_name },
  })

  if (authErr || !authResult.user) {
    return NextResponse.json({ error: `Failed to create user: ${authErr?.message ?? 'unknown'}` }, { status: 500 })
  }

  const userId = authResult.user.id

  // 2. Get the active event id
  const { data: event } = await adminClient
    .from('events')
    .select('id')
    .eq('is_active', true)
    .single()
  if (!event) return NextResponse.json({ error: 'No active event' }, { status: 500 })

  // 3. Insert application — needs_roster=true; lifecycle dates populated for consistency
  const now = new Date()
  const depositDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const { data: app, error: appErr } = await adminClient
    .from('applications')
    .insert({
      event_id: event.id,
      user_id: userId,
      exhibitor_type: body.exhibitor_type,
      business_name: body.full_name,
      contact_name: body.full_name,
      email: body.email,
      phone: body.phone || null,
      booth_size: null,
      artist_single_qty: body.artist_single_qty,
      artist_double_qty: body.artist_double_qty,
      vendor_single_qty: body.vendor_single_qty,
      vendor_double_qty: body.vendor_double_qty,
      corner_count: body.corner_count,
      add_ons: [],
      artist_count: body.artist_count,
      is_corner: body.corner_count > 0,
      is_veteran: false,
      total_amount: body.total_amount_cents,
      status: 'approved',
      approved_at: now.toISOString(),
      deposit_due_at: depositDueAt.toISOString(),
      final_due_at: FINAL_DUE_AT,
      needs_roster: true,
      notes: body.notes || null,
    })
    .select('id')
    .single()
  if (appErr || !app) {
    return NextResponse.json({ error: `Failed to create application: ${appErr?.message}` }, { status: 500 })
  }

  // 4. Insert paid-in-full invoice
  const nowIso = now.toISOString()
  const { error: invErr } = await adminClient.from('invoices').insert({
    application_id: app.id,
    amount: body.total_amount_cents,
    amount_paid: body.total_amount_cents,
    status: 'paid',
    paid_at: nowIso,
    deposit_paid_at: nowIso,
    final_paid_at: nowIso,
  })
  if (invErr) {
    return NextResponse.json({ error: `Application created but invoice failed: ${invErr.message}` }, { status: 500 })
  }

  // 5. Trigger launch email via the existing email route. We're already
  //    in a server context, so just call the route directly via fetch using
  //    the admin's session cookies.
  // (Email kicks off but we don't block on it failing — the import is the source of truth)
  fetch(`${req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ kind: 'returner_invite', applicationId: app.id }),
  }).catch(err => console.error('returner_invite email failed:', err))

  return NextResponse.json({ ok: true, userId, applicationId: app.id })
}
```

- [ ] **Step 2: Create the admin form page**

Path: `src/app/admin/import-returning/page.tsx`

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'

const ARTIST_SIZES = [
  { kind: 'single' as const, label: 'Artist Single ($800 / 2026: $700)' },
  { kind: 'double' as const, label: 'Artist Double ($1200 / 2026: $1100)' },
]
const VENDOR_SIZES = [
  { kind: 'single' as const, label: 'Vendor Single ($500 / 2026: $400)' },
  { kind: 'double' as const, label: 'Vendor Double ($800 / 2026: $700)' },
]

export default function ImportReturningPage() {
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    phone: '',
    exhibitor_type: 'artist' as 'artist' | 'vendor',
    artist_single_qty: 1,
    artist_double_qty: 0,
    vendor_single_qty: 0,
    vendor_double_qty: 0,
    corner_count: 0,
    total_amount_dollars: '',
    artist_count: 1,
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [lastImported, setLastImported] = useState<{ email: string; applicationId: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const totalCents = Math.round(parseFloat(form.total_amount_dollars || '0') * 100)
    if (totalCents <= 0) { toast.error('Total paid must be > 0'); return }
    if (!form.email || !form.full_name) { toast.error('Email and full name required'); return }

    setSubmitting(true)
    const res = await fetch('/api/admin/import-returning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        total_amount_cents: totalCents,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { toast.error(json.error ?? 'Import failed'); return }

    toast.success(`Imported ${form.email}`)
    setLastImported({ email: form.email, applicationId: json.applicationId })

    // Reset form for next entry — keep exhibitor_type since admin likely imports a batch
    setForm({
      email: '', full_name: '', phone: '',
      exhibitor_type: form.exhibitor_type,
      artist_single_qty: form.exhibitor_type === 'artist' ? 1 : 0,
      artist_double_qty: 0,
      vendor_single_qty: form.exhibitor_type === 'vendor' ? 1 : 0,
      vendor_double_qty: 0,
      corner_count: 0,
      total_amount_dollars: '',
      artist_count: 1,
      notes: '',
    })
  }

  const sizes = form.exhibitor_type === 'artist' ? ARTIST_SIZES : VENDOR_SIZES

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link href="/admin" className="text-sm font-semibold" style={{ color: '#8B7355' }}>← Admin</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Import returning customer</h1>
        <p className="mt-1 text-sm" style={{ color: '#999' }}>
          For 2026 returners who paid in full at 2026 pricing during the offline window. Creates a paid-in-full invoice and
          marks the applicant as needing to complete their artist roster from /portal.
        </p>
      </div>

      {lastImported && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>
          Imported <span className="text-white">{lastImported.email}</span>. Application <span className="text-white">{lastImported.applicationId}</span>.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email *">
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Full name *">
            <input type="text" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Type *">
            <select value={form.exhibitor_type} onChange={e => {
              const t = e.target.value as 'artist' | 'vendor'
              setForm({
                ...form,
                exhibitor_type: t,
                artist_single_qty: t === 'artist' ? 1 : 0,
                artist_double_qty: 0,
                vendor_single_qty: t === 'vendor' ? 1 : 0,
                vendor_double_qty: 0,
              })
            }} className={inputCls} style={inputStyle}>
              <option value="artist">Artist</option>
              <option value="vendor">Vendor</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {sizes.map(s => {
            const fieldKey = (form.exhibitor_type === 'artist' ? 'artist_' : 'vendor_') + s.kind + '_qty' as
              | 'artist_single_qty' | 'artist_double_qty' | 'vendor_single_qty' | 'vendor_double_qty'
            return (
              <Field key={s.kind} label={s.label}>
                <input
                  type="number"
                  min={0}
                  value={form[fieldKey] as number}
                  onChange={e => setForm({ ...form, [fieldKey]: Math.max(0, parseInt(e.target.value) || 0) })}
                  className={inputCls}
                  style={inputStyle}
                />
              </Field>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Corner count">
            <input type="number" min={0} value={form.corner_count} onChange={e => setForm({ ...form, corner_count: Math.max(0, parseInt(e.target.value) || 0) })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Artist count (for permit)">
            <input type="number" min={1} value={form.artist_count} onChange={e => setForm({ ...form, artist_count: Math.max(1, parseInt(e.target.value) || 1) })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Total paid (USD) *">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#999' }}>$</span>
              <input type="number" step="0.01" min={0} required value={form.total_amount_dollars} onChange={e => setForm({ ...form, total_amount_dollars: e.target.value })} className="w-full rounded-lg pl-7 pr-4 py-3 text-sm text-white outline-none" style={inputStyle} />
            </div>
          </Field>
        </div>

        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} style={inputStyle} />
        </Field>

        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
          {submitting ? 'Creating account…' : 'Create returner'}
        </button>
      </form>
    </div>
  )
}

const inputCls = 'w-full rounded-lg px-4 py-3 text-sm text-white outline-none'
const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' } as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Build verification**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
npm run build 2>&1 | grep -E "/admin/import-returning|/api/admin/import-returning|error" | head -5
```

Expected: both routes appear in build output, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/import-returning/page.tsx src/app/api/admin/import-returning/route.ts
git commit -m "feat(admin): /admin/import-returning page + API for pre-loading 2026 returners

Admin form collects email, name, phone, booth qtys, total paid (cents).
API route uses service role to: create auto-confirmed auth user, insert
needs_roster=true application with all lifecycle dates set, insert a
paid-in-full invoice (amount_paid = amount, deposit_paid_at and
final_paid_at both set), and trigger a returner_invite email."
```

---

### Task 2: Add the returner_invite email template

**Files:**
- Modify: `src/app/api/send-email/route.ts`

The Task 1 admin handler triggers a `kind='returner_invite'` email. Add the template + dispatch.

- [ ] **Step 1: Add the template function**

Place near the existing approve/reject/expiration/cancellation templates, using `emailWrapper()`:

```ts
function returnerInviteEmail(businessName: string, loginUrl: string, resetUrl: string) {
  return emailWrapper(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#4ade80;">
      Welcome Back
    </p>
    <h2 style="margin:0 0 20px; font-family:Georgia,serif; font-size:26px; font-weight:700; color:#ffffff;">
      Your AATC 2027 booth is reserved
    </h2>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Hi ${businessName},
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Thanks for paying in full at 2026 pricing during the early-bird window. Your AATC 2027 booth is locked in —
      no further payment is required.
    </p>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      To finish setting up your account, you need to:
    </p>
    <ol style="margin:0 0 16px; padding-left:20px; font-size:15px; line-height:1.7; color:#cccccc;">
      <li><a href="${resetUrl}" style="color:#C4A882;">Set a password</a> for your account</li>
      <li>Sign in and complete your <strong style="color:#ffffff;">artist roster</strong> (names + IDs for everyone working your booth)</li>
    </ol>
    <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#cccccc;">
      Once your roster is complete, your booth will appear in the public exhibitor directory.
    </p>
    <p style="margin:24px 0 0; text-align:center;">
      <a href="${resetUrl}" style="display:inline-block; background:#8B7355; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:1px; padding:14px 32px; border-radius:10px;">
        Set My Password →
      </a>
    </p>
    <p style="margin:24px 0 0; font-size:13px; line-height:1.7; color:#666666; text-align:center;">
      Already have a password? <a href="${loginUrl}" style="color:#8B7355;">Sign in here</a>.
    </p>
  `)
}
```

- [ ] **Step 2: Add `returner_invite` branch to the dispatch in the POST handler**

```ts
} else if (kind === 'returner_invite') {
  // For new returner accounts. Send the password-set link.
  // We need a Supabase password recovery URL. The cleanest way: have the
  // admin client generate one via auth.admin.generateLink.
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: app.email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  })
  const resetUrl = linkData?.properties?.action_link ?? `${SITE_URL}/auth/forgot-password`
  const loginUrl = `${SITE_URL}/auth/login`
  subject = `Welcome back to AATC 2027 — ${app.business_name}`
  html = returnerInviteEmail(app.business_name, loginUrl, resetUrl)
}
```

(Make sure `import { createClient } from '@supabase/supabase-js'` exists at the top of the file. It probably already does — check the existing imports first; don't duplicate.)

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/send-email/route.ts
git commit -m "feat(email): returner_invite template + dispatch

Sent by /api/admin/import-returning. Generates a Supabase recovery link
via auth.admin.generateLink so the user can set a password directly."
```

---

### Task 3: Add /portal needs_roster branch

**Files:**
- Modify: `src/app/portal/page.tsx`

When a logged-in user has an application with `needs_roster=true`, the portal should show a "Complete your roster" form instead of the normal status card. The form collects per-artist names + ID uploads (mirrors the existing wizard step 3) plus a booth-holder ID upload (since that wasn't collected at import time).

- [ ] **Step 1: Find the portal's main applicant render**

```bash
grep -n "needs_roster\|application.status\|applications.*select" src/app/portal/page.tsx | head -10
```

- [ ] **Step 2: Add needs_roster fetch + branch**

The portal already fetches the user's `applications` row. Add `needs_roster` to the select query if it isn't there. Then in the JSX, add a branch BEFORE the normal status-card render:

```tsx
{application.needs_roster ? (
  <RosterCompletionPanel application={application} onComplete={() => window.location.reload()} />
) : (
  /* existing status card / pay button / etc. */
)}
```

- [ ] **Step 3: Implement RosterCompletionPanel**

Place it inside `src/app/portal/page.tsx` near the bottom (or extract to `src/components/portal/RosterCompletionPanel.tsx` if the file is getting unwieldy — judgment call based on the file size; portal is already ~1450 lines so extraction is preferred).

If extracting, create `src/components/portal/RosterCompletionPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import type { Database } from '@/types/database'

type App = Database['public']['Tables']['applications']['Row']

export function RosterCompletionPanel({ application, onComplete }: { application: App; onComplete: () => void }) {
  const supabase = createClient()
  const [boothHolderIdFile, setBoothHolderIdFile] = useState<File | null>(null)
  const [artists, setArtists] = useState<Array<{ name: string; idFile: File | null; nickname: string; instagram: string }>>(
    Array.from({ length: Math.max(1, application.artist_count) }, () => ({ name: '', idFile: null, nickname: '', instagram: '' }))
  )
  const [submitting, setSubmitting] = useState(false)

  const isArtist = application.exhibitor_type === 'artist'

  const updateArtist = (i: number, patch: Partial<{ name: string; idFile: File | null; nickname: string; instagram: string }>) => {
    setArtists(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  }

  const addArtist = () => setArtists(prev => [...prev, { name: '', idFile: null, nickname: '', instagram: '' }])
  const removeArtist = (i: number) => setArtists(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!boothHolderIdFile) { toast.error('Booth holder ID is required'); return }
    if (isArtist && artists.some(a => !a.name.trim() || !a.idFile)) {
      toast.error('Every artist needs a name and ID upload')
      return
    }

    setSubmitting(true)

    // 1. Upload booth-holder ID to private bucket
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Session expired'); setSubmitting(false); return }

    const ts = Date.now()
    const ext = (boothHolderIdFile.name.split('.').pop() || 'jpg').toLowerCase()
    const idPath = `${user.id}/${ts}-booth-holder-id.${ext}`
    const { error: idErr } = await supabase.storage
      .from('application-docs')
      .upload(idPath, boothHolderIdFile)
    if (idErr) { toast.error(`ID upload failed: ${idErr.message}`); setSubmitting(false); return }

    // 2. For each artist, upload their ID and build the artists JSONB array
    const artistRecords: Array<{ name: string; id_url: string | null; nickname?: string; instagram?: string }> = []
    if (isArtist) {
      for (let i = 0; i < artists.length; i++) {
        const a = artists[i]
        if (!a.idFile) continue
        const aExt = (a.idFile.name.split('.').pop() || 'jpg').toLowerCase()
        const aPath = `${user.id}/${ts}-artist-${i + 1}-id.${aExt}`
        const { error: aErr } = await supabase.storage
          .from('application-docs')
          .upload(aPath, a.idFile)
        if (aErr) { toast.error(`Artist ${i + 1} ID upload failed: ${aErr.message}`); setSubmitting(false); return }
        artistRecords.push({
          name: a.name.trim(),
          id_url: aPath,
          ...(a.nickname.trim() ? { nickname: a.nickname.trim() } : {}),
          ...(a.instagram.trim() ? { instagram: a.instagram.trim() } : {}),
        })
      }
    }

    // 3. Update the application — flip needs_roster=false, set artists, set id_doc_url
    const { error: updateErr } = await supabase
      .from('applications')
      .update({
        needs_roster: false,
        artists: isArtist ? artistRecords : null,
        artist_count: isArtist ? artistRecords.length : 0,
        id_doc_url: idPath,
      })
      .eq('id', application.id)
    if (updateErr) { toast.error(`Save failed: ${updateErr.message}`); setSubmitting(false); return }

    // 4. Create the exhibitor row so they appear publicly
    const { error: exhErr } = await supabase.from('exhibitors').insert({
      event_id: application.event_id,
      application_id: application.id,
      business_name: application.business_name,
      exhibitor_type: application.exhibitor_type,
    })
    // exhibitors row may already exist if admin created it earlier — ignore conflicts
    if (exhErr && !exhErr.message.includes('duplicate')) {
      toast.error(`Profile creation failed: ${exhErr.message}`)
      setSubmitting(false)
      return
    }

    toast.success('Roster complete — your booth is now visible publicly')
    onComplete()
  }

  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: '#8B7355' }}>Welcome back</p>
      <h2 className="mb-4 font-display text-2xl font-bold text-white">Complete your roster</h2>
      <p className="mb-6 text-sm" style={{ color: '#999' }}>
        Your AATC 2027 booth is paid in full. To appear in the public directory, please upload your booth-holder ID
        {isArtist && ' and add your artists'}.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Booth holder ID */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white">Booth holder ID *</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e => setBoothHolderIdFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-white" />
          <p className="mt-1 text-xs" style={{ color: '#666' }}>JPEG / PNG / WEBP / PDF, max 50MB</p>
        </div>

        {isArtist && (
          <div>
            <p className="mb-2 text-sm font-medium text-white">Artists</p>
            {artists.map((a, i) => (
              <div key={i} className="mb-3 rounded-lg p-4" style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">Artist {i + 1}</span>
                  {artists.length > 1 && (
                    <button type="button" onClick={() => removeArtist(i)} className="text-xs" style={{ color: '#f87171' }}>Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="text" placeholder="Name *" required value={a.name} onChange={e => updateArtist(i, { name: e.target.value })} className="rounded px-3 py-2 text-sm text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <input type="text" placeholder="Nickname" value={a.nickname} onChange={e => updateArtist(i, { nickname: e.target.value })} className="rounded px-3 py-2 text-sm text-white" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <input type="text" placeholder="Instagram" value={a.instagram} onChange={e => updateArtist(i, { instagram: e.target.value })} className="rounded px-3 py-2 text-sm text-white sm:col-span-2" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }} />
                  <div className="sm:col-span-2">
                    <label className="text-xs text-white">ID upload *</label>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e => updateArtist(i, { idFile: e.target.files?.[0] ?? null })} className="block w-full text-sm text-white mt-1" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addArtist} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#0a0a0a', color: '#C4A882', border: '1px solid #2a2a2a' }}>+ Add artist</button>
          </div>
        )}

        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#8B7355' }}>
          {submitting ? 'Submitting…' : 'Complete roster'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into /portal/page.tsx**

Import the panel:

```tsx
import { RosterCompletionPanel } from '@/components/portal/RosterCompletionPanel'
```

Add a check in the application-render JSX:

```tsx
{application.needs_roster ? (
  <RosterCompletionPanel application={application} onComplete={() => window.location.reload()} />
) : (
  /* existing status card / pay button / etc. — wrap the whole existing block in this else branch */
)}
```

Add `needs_roster` to the supabase select query that fetches the application (search for `.from('applications').select(`).

- [ ] **Step 5: Build verification**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/page.tsx src/components/portal/RosterCompletionPanel.tsx
git commit -m "feat(portal): RosterCompletionPanel for needs_roster=true accounts

Pre-loaded returners land here. Form collects booth-holder ID + per-artist
names+IDs (artists only). On submit: uploads to application-docs bucket,
sets artists JSONB, flips needs_roster=false, creates exhibitors row so
the applicant appears on /directory."
```

---

### Task 4: Sponsor public-read RLS — gate on final_paid_at

**Files:**
- Create: `supabase/migrations/025_sponsor_visibility.sql`

The current sponsor public-read policy (from migration 019) shows sponsors with `featured_footer=true AND status='confirmed'`. The spec wants sponsors **only visible when paid in full** — gate additionally on the linked invoice's `final_paid_at`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 025: Sponsor visibility gated on final_paid_at
-- Replaces the migration 019 policy. Public can read a sponsorship row
-- only when:
--   - featured_footer = true
--   - status = 'confirmed'
--   - at least one linked invoice has final_paid_at IS NOT NULL
-- ============================================================

drop policy if exists "Public can read featured footer sponsors" on sponsorships;

create policy "Public can read paid featured sponsors"
  on sponsorships for select
  to anon, authenticated
  using (
    featured_footer = true
    and status = 'confirmed'
    and exists (
      select 1 from invoices i
       where i.sponsorship_id = sponsorships.id
         and i.final_paid_at is not null
    )
  );
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Open `https://supabase.com/dashboard/project/srlgjovefsmtkxthtjkz/sql/new`, paste, run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select policyname, qual
  from pg_policies
 where tablename = 'sponsorships'
   and policyname like '%paid featured%';
```

Expected: 1 row.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/025_sponsor_visibility.sql
git commit -m "feat(db): migration 025 — sponsor visibility gated on final_paid_at

Replaces migration 019 policy. Sponsors now only appear publicly (footer
logos, /sponsors page) when their linked invoice has final_paid_at set,
in addition to the existing featured_footer + status='confirmed' checks."
```

---

### Task 5: Update sponsor display sites to use the new visibility

**Files:**
- Modify: `src/components/SiteFooter.tsx` (sponsor logos)
- Modify: `src/app/sponsors/page.tsx` (sponsors page)

The RLS change in Task 4 enforces visibility at the DB level — anon callers automatically can't see un-paid sponsors anymore. But the application-level select queries may still over-fetch (if they use the service role somewhere) or display loading states differently. Verify both display sites work correctly under the new RLS.

- [ ] **Step 1: Audit `src/components/SiteFooter.tsx`**

Look for the supabase query that fetches `sponsorships` for the footer logos. It probably looks like:

```ts
.from('sponsorships')
.select('id, sponsor_name, logo_url')
.eq('featured_footer', true)
.eq('status', 'confirmed')
.limit(5)
```

Under the new RLS, this query (called from the browser as the anon role) will only return rows that ALSO have `final_paid_at IS NOT NULL` on a linked invoice. No code change needed if RLS does the gating — but verify the existing query isn't relying on features that bypass RLS.

If the query needs to be explicit (e.g., to give a clear "no sponsors yet" experience), add an `inner` join filter:

```ts
.from('sponsorships')
.select('id, sponsor_name, logo_url, invoices!inner(final_paid_at)')
.eq('featured_footer', true)
.eq('status', 'confirmed')
.not('invoices.final_paid_at', 'is', null)
.limit(5)
```

- [ ] **Step 2: Audit `src/app/sponsors/page.tsx`**

Same pattern. If the page lists all confirmed sponsors (not just featured-footer), it likely doesn't use the `featured_footer` filter. The new RLS won't affect non-`featured_footer` sponsors at all — its predicate requires `featured_footer = true`. So:
- If the sponsors page ALSO requires sponsors to be paid-in-full to show up, add an inner join + `final_paid_at` filter explicitly to the query.
- If the page is fine showing sponsors regardless of payment (e.g., "sponsorship tiers" page that's just informational), leave it alone.

Read the file and make the call.

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit (if any changes)**

```bash
git add src/components/SiteFooter.tsx src/app/sponsors/page.tsx
git commit -m "feat(sponsors): explicit final_paid_at filter on display queries

Adds an inner-join filter on invoices.final_paid_at where sponsor
visibility should be payment-gated. Belt-and-suspenders alongside
the migration 025 RLS policy."
```

---

### Task 6: Add "Change password" link in portal navigation

**Files:**
- Modify: `src/app/portal/page.tsx` OR `src/components/PublicNav.tsx` (whichever the user-facing menu lives in)

The `/auth/reset-password` page works for logged-in users (built in Plan 1) but isn't linked from anywhere. Add a discoverable link.

- [ ] **Step 1: Find the right place**

```bash
grep -n "Sign out\|signOut\|signout\|user.email" src/app/portal/page.tsx src/components/PublicNav.tsx | head -10
```

There's likely a user-area in the portal header showing the user's email and a "Sign out" button. Add a "Change password" link adjacent.

- [ ] **Step 2: Add the link**

In the appropriate location, insert:

```tsx
<Link
  href="/auth/reset-password"
  className="text-sm font-medium transition-colors"
  style={{ color: '#8B7355' }}
>
  Change password
</Link>
```

(Match the styling of the adjacent "Sign out" button or link.)

- [ ] **Step 3: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add <files>
git commit -m "feat(portal): expose 'Change password' link in user menu

Links to /auth/reset-password (the existing page that works for both
recovery flow and logged-in users)."
```

---

### Task 7: Admin "Reset user password" action

**Files:**
- Create: `src/app/api/admin/reset-user-password/route.ts`
- Modify: `src/app/admin/applications/page.tsx` (add the button to the detail drawer)

When an admin opens an application's detail drawer, a button "Reset password" generates a fresh recovery link via the Auth Admin API and either emails it to the applicant or shows it inline for the admin to copy.

- [ ] **Step 1: Create the admin API route**

Path: `src/app/api/admin/reset-user-password/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aatc-platform.vercel.app'

export async function POST(req: Request) {
  // Auth check — caller must be an admin
  const cookieStore = await cookies()
  const userClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: linkData, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  })

  if (error || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate link' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, resetLink: linkData.properties.action_link })
}
```

- [ ] **Step 2: Add the button to the application detail drawer**

In `src/app/admin/applications/page.tsx`, find the detail drawer or detail page UI. Add a "Reset password" button. On click:

```tsx
const handleResetPassword = async (email: string) => {
  const res = await fetch('/api/admin/reset-user-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const json = await res.json()
  if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
  // Show the link to the admin so they can copy/paste it (e.g., into a text/SMS)
  navigator.clipboard.writeText(json.resetLink)
  toast.success('Reset link copied to clipboard. Send it to the user.')
}

// In the detail drawer JSX, near other action buttons:
<button
  type="button"
  onClick={() => handleResetPassword(selectedApp.email)}
  className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
  style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
>
  Reset password
</button>
```

(Adapt to whatever the existing variable name is for the selected/drawer application; likely `selectedApp` or `app`.)

- [ ] **Step 3: Build verification**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/reset-user-password/route.ts src/app/admin/applications/page.tsx
git commit -m "feat(admin): /api/admin/reset-user-password + UI button

Admin-only API that generates a Supabase recovery link via Auth Admin API.
The detail drawer's 'Reset password' button copies the link to clipboard
so the admin can deliver it to the user out-of-band (text, email)."
```

---

### Task 8: Trim Stripe webhook events (manual)

**Files:** none modified.

The Stripe webhook is currently subscribed to 7 events; only `checkout.session.completed` is needed by current code. Trim to reduce noise.

- [ ] **Step 1: Open the Stripe dashboard webhook detail**

Navigate to https://dashboard.stripe.com/webhooks → find the AATC platform webhook (endpoint: `https://aatc-platform.vercel.app/api/webhooks/stripe`).

- [ ] **Step 2: Edit the destination**

Click "Edit destination" or similar. In the events list, **uncheck everything except `checkout.session.completed`**. Save.

- [ ] **Step 3: Verify in dashboard**

The endpoint detail should now show "Listening to 1 event."

No commit (no local file changes).

---

### Task 9: Build + lint verification

**Files:** none modified.

- [ ] **Step 1: Clean build**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
rm -rf .next
npm run build 2>&1 | tail -10
```

Expected: build succeeds, no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -10
```

Expected: same 17 pre-existing errors (or fewer if any happened to be in files this plan touched and got fixed). NO new errors introduced by Plan 4.

No commit.

---

### Task 10: Deploy to production

**Files:** none modified.

- [ ] **Step 1: Push commits**

```bash
git push origin develop
```

- [ ] **Step 2: Trigger production deploy**

```bash
vercel --prod --yes
```

Watch for `Deployment ... ready.`

- [ ] **Step 3: Verify routes**

```bash
bash -c 'for path in /admin/import-returning /api/admin/import-returning /api/admin/reset-user-password /portal /auth/reset-password; do code=$(curl -s -o /dev/null -w "%{http_code}" -X GET "https://aatc-platform.vercel.app$path"); printf "%-40s %s\n" "$path" "$code"; done'
```

Expected:
- `/admin/import-returning` → 307 (redirect to login when not authed)
- `/api/admin/import-returning` → 405 (GET not allowed) or 401 (no session)
- `/api/admin/reset-user-password` → 405 or 401
- `/portal` → 307
- `/auth/reset-password` → 200

---

### Task 11: Smoke test

**Files:** none modified.

- [ ] **Step 1: Manual import-returning test**

While logged in as admin (ryan or malia), visit https://aatc-platform.vercel.app/admin/import-returning. Fill in:
- Email: a test address you control (e.g., your own with `+test` alias)
- Full name: `Test Returner`
- Phone: any
- Type: Artist
- Artist Single qty: 1
- Artist count: 1
- Total paid: 700.00 (= $700, 2026 single price)
- Notes: `smoke test`

Submit. Expected: green success banner, form clears, email arrives within 1–2 minutes (check spam — note the Supabase Site URL caveat from Plan 1's runbook; the link in the email may still point to localhost depending on whether the user fixed Site URL).

- [ ] **Step 2: Verify the database**

In Supabase SQL Editor:

```sql
select id, email, business_name, status, needs_roster, total_amount
  from applications
 where email = '<test email>'
 order by created_at desc
 limit 1;

select amount, amount_paid, status, deposit_paid_at, final_paid_at
  from invoices
 where application_id = (select id from applications where email = '<test email>' order by created_at desc limit 1);
```

Expected:
- Application: `status='approved'`, `needs_roster=true`, `total_amount=70000`
- Invoice: `amount=70000`, `amount_paid=70000`, `status='paid'`, both milestone timestamps set

- [ ] **Step 3: (Optional) Test the roster-completion flow**

Log out as admin, log in as the test returner using the password reset link from the email. Visit `/portal`. Expected: see the "Complete your roster" panel. Fill it in (use any test ID image), submit.

Verify the application now has `needs_roster=false` and an `exhibitors` row exists.

```sql
select a.id, a.needs_roster, a.id_doc_url, e.id as exhibitor_id
  from applications a
  left join exhibitors e on e.application_id = a.id
 where a.email = '<test email>';
```

Expected: `needs_roster=false`, `id_doc_url` populated, `exhibitor_id` non-null.

- [ ] **Step 4: Cleanup test data**

```sql
delete from exhibitors where application_id = (select id from applications where email = '<test email>');
delete from invoices where application_id = (select id from applications where email = '<test email>');
delete from applications where email = '<test email>';
-- Remove the auth user via the dashboard or:
-- (in shell) curl -X DELETE -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" "$SUPABASE_URL/auth/v1/admin/users/<test_user_id>"
```

---

### Task 12: Plan 4 success criteria + runbook update

**Files:**
- Modify: `docs/deployment.md`

- [ ] **Step 1: Walk the criteria**

- [ ] `/admin/import-returning` is reachable for admins, creates a returner account end-to-end (auth user, application, invoice, email)
- [ ] Test returner receives the welcome email with a working password-reset link
- [ ] `/portal` shows the RosterCompletionPanel for `needs_roster=true` accounts
- [ ] Submitting the roster form uploads files, sets `needs_roster=false`, creates an `exhibitors` row, and the applicant appears on `/directory`
- [ ] Migration 025 applied; sponsors only appear publicly when their invoice has `final_paid_at` set
- [ ] "Change password" link is visible somewhere from the portal
- [ ] Admin "Reset password" button copies a working recovery link to clipboard
- [ ] Stripe webhook is now listening to only `checkout.session.completed`
- [ ] Build passes, no new lint errors

- [ ] **Step 2: Mark Plan 4 done**

```
# Edit docs/deployment.md → Plans status block:
- **Plan 4 — pre-load returners + sponsors + polish:** ✅ complete (<DATE>)
```

```bash
git add docs/deployment.md
git commit -m "docs: mark Plan 4 complete + remove Plan 4 from follow-up backlog"
git push origin develop
```

---

## Notes for the executing agent

- The Auth Admin API is what makes the import-returning flow work. The service role key is in `SUPABASE_SERVICE_ROLE_KEY` (Vercel env + .env.local). Never expose it client-side; all calls go through `/api/admin/*` routes.
- `auth.admin.createUser({ email_confirm: true })` skips the confirmation email entirely — the user appears as already-verified. The temporary password is opaque garbage; the user sets a real one via the recovery link.
- `auth.admin.generateLink({ type: 'recovery' })` returns a magic link without sending an email. We bundle the link into our own email template (returner_invite). This avoids hitting Supabase's email rate limit.
- The `/portal/page.tsx` file is large (~1450 lines). Extract `RosterCompletionPanel` to a separate file rather than inlining — keeps the file under control.
- The roster-completion submit creates an `exhibitors` row directly. If the row already exists (e.g., a duplicate submit), the `if (exhErr && !exhErr.message.includes('duplicate'))` check ignores it. There's no unique constraint on `exhibitors.application_id` in the schema as far as I know — verify before relying on this; if missing, add `if not exists` checks before insert.
- The Stripe webhook event-list trim is purely cosmetic — extra events are silently ignored by the webhook code. Skip if you want; the `summary` of the lifecycle cron is more important.

## Dependencies on user

- Apply migration 025 in Supabase SQL Editor (Task 4 step 2)
- Smoke-test the import-returning flow with a real email address (Task 11)
- Trim the Stripe webhook events in the dashboard (Task 8)
- Confirm Site URL is updated in Supabase (mentioned as caveat in Task 11) — without this, the recovery link in the welcome email will redirect to localhost, defeating the purpose. This is from Plan 1's known follow-ups in the runbook.
