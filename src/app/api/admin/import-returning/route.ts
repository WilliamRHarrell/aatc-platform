import { NextResponse } from 'next/server'
import { FINAL_DUE_AT } from '@/lib/event-config'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'


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

  // ── Rollback ────────────────────────────────────────────────
  // The auth user is created FIRST because applications.user_id references it,
  // so the order cannot be reversed. That makes every failure below capable of
  // stranding a real, logged-in-able account with no application behind it —
  // and worse, making the import UNREPEATABLE for that address, because the
  // operator's retry hits "email already registered" and needs manual cleanup
  // in the Supabase dashboard to get past it.
  //
  // There is no transaction spanning auth.users and the public schema, so this
  // is a compensating delete rather than a real rollback. If the compensation
  // itself fails there is nothing further to try — log loudly enough that the
  // orphan is findable, because nothing else will report it.
  const rollback = async (stage: string) => {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) {
      console.error(
        `[import-returning] ROLLBACK FAILED after ${stage} for ${body.email} (${userId}): ` +
        `${error.message}. An orphaned auth user now exists — it must be deleted by hand ` +
        'before this address can be imported again.'
      )
      return
    }
    console.warn(`[import-returning] rolled back auth user ${userId} (${body.email}) after ${stage}.`)
  }

  // 2. Get the active event id
  const { data: event } = await adminClient
    .from('events')
    .select('id')
    .eq('is_active', true)
    .single()
  if (!event) {
    await rollback('no active event')
    return NextResponse.json({ error: 'No active event' }, { status: 500 })
  }

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
    await rollback('application insert failed')
    return NextResponse.json({ error: `Failed to create application: ${appErr?.message}` }, { status: 500 })
  }

  // 4. Insert paid-in-full invoice
  //
  // deposit_paid_at AND final_paid_at ARE LOAD-BEARING — do not drop them to
  // "just" amount_paid/status. The lifecycle sweep's four branches all key on
  // `invoices.deposit_paid_at is null` / `invoices.final_paid_at is null`, NOT
  // on status or amount_paid. An imported returner with these unset would be
  // approved with a deposit_due_at 30 days out and no deposit milestone — i.e.
  // a sweep target — and the destructive branch releases their booth
  // irreversibly. Setting the milestone columns directly is what keeps every
  // imported exhibitor out of all four branches.
  //
  // This marks the invoice paid IN FULL. Correct for a returning exhibitor who
  // paid in full; there is no partial-payment path here, so anyone who only
  // paid a deposit must be recorded through the admin payment modal instead.
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
    // Roll back the application too, not just the auth user. Leaving an
    // approved application with no invoice behind is worse than leaving
    // nothing: it has a deposit_due_at and no deposit_paid_at, which is
    // precisely the lifecycle sweep's expiry profile. A half-finished import
    // would arm the sweep against the exhibitor it was meant to onboard.
    const { error: appDelErr } = await adminClient.from('applications').delete().eq('id', app.id)
    if (appDelErr) {
      console.error(
        `[import-returning] could not remove application ${app.id} after invoice failure: ` +
        `${appDelErr.message}. It is approved with no invoice and IS A SWEEP TARGET — ` +
        'delete it or record its payment before LIFECYCLE_SWEEP_ENABLED is set.'
      )
    }
    await rollback('invoice insert failed')
    return NextResponse.json({ error: `Import failed at the invoice step and was rolled back: ${invErr.message}` }, { status: 500 })
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
