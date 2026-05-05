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

  // 1. Create auth user (auto-confirmed)
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

  // 3. Insert application — needs_roster=true
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

  // 5. Trigger launch email (fire-and-forget; don't block on failure)
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
