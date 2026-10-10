import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServerClient } from '@/lib/supabase-server'
import { planApplication, likeExact, samePricingInputs, type EditorInput, type PricingInputs } from '@/lib/admin-application'
import { approvePayload, compInvoiceAmount, discountedInvoiceUpdate, SEND_BACK_PAYLOAD } from '@/lib/comp'
import { ACTIVE_APPLICATION_STATUSES } from '@/lib/invite-link'
import { FINAL_DUE_AT } from '@/lib/event-config'

/**
 * POST /api/admin/applications/editor - create or update a whole application
 * on someone's behalf (application editor, Ryan 2026-10-09). Admin only.
 *
 * body: { id?: string, input: EditorInput }   (no id = create)
 *
 * Runs as the signed-in admin (cookie client), so RLS ("applications: admin
 * all") and every trigger see an admin: the 079 insert clamp, the 088 cap and
 * roster guard, 089 comp columns, 096 agreed_total. Rules: lib/admin-application.ts.
 *
 *   1. One active application per person per event: rows with no account are
 *      outside the database index (079), so the email is checked here.
 *   2. Insert (user_id null: Invite & link connects an account later) or update.
 *      An update whose ORDER is unchanged (booths, corners, add-ons, artist
 *      count, veteran, money choice; samePricingInputs) keeps the stored
 *      price, comp and invoice: rows priced under older prices or imported
 *      stay as they are, and a drawer discount survives. A changed order
 *      re-prices; once money has moved it is refused (editor PR 3).
 *   3. Comp: set_comp() (the insert clamp clears comped_at even for admins).
 *   4. Status: approved writes what Approve writes and creates the invoice, or
 *      re-prices it when the order changed (agreed total, comp, or list);
 *      pending sends back; keep (editing only) leaves rejected or waitlisted
 *      as it is. No email
 *      is sent from here: Invite & link is how the person hears.
 *   5. VIP Meet & Greet (098): artists ticked "Attending" get a
 *      vip_featured_artists row by their roster uid; unticked ones lose it.
 * Returns { id } or { error, errors?, needsConfirm? }.
 */
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { id?: unknown; input?: EditorInput } | null
  if (!body?.input) return NextResponse.json({ error: 'input is required' }, { status: 400 })
  const id = typeof body.id === 'string' && body.id ? body.id : null
  if (body.input.status === 'keep' && !id) return NextResponse.json({ error: 'A new application needs a status: pending or approved.' }, { status: 400 })

  // Editing: the stored row decides what the planner must not overturn.
  const { data: stored } = id
    ? await supabase.from('applications').select('needs_roster, exhibitor_type, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count, is_veteran, add_ons').eq('id', id).maybeSingle()
    : { data: null }
  const v = planApplication(body.input, stored ? { needs_roster: stored.needs_roster, artist_count: stored.artist_count, order: stored } : undefined)
  if (!v.ok) {
    return NextResponse.json({ error: v.needsConfirm ? v.errors.money : 'Please check the highlighted fields.', errors: v.errors, needsConfirm: v.needsConfirm ?? false }, { status: v.needsConfirm ? 409 : 400 })
  }
  const { row, comp, listCents } = v.plan

  // ── the event (create: the active one; update: the row's own) ──
  let eventId: string
  let existing: (PricingInputs & { id: string; status: string; event_id: string; comped_at: string | null; permits_comped_at: string | null; total_amount: number; agreed_total: number | null }) | null = null
  if (id) {
    const { data } = await supabase.from('applications')
      .select('id, status, event_id, comped_at, permits_comped_at, total_amount, agreed_total, exhibitor_type, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count, is_veteran, add_ons').eq('id', id).single()
    if (!data) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    existing = data
    eventId = data.event_id
  } else {
    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).single()
    if (!event) return NextResponse.json({ error: 'No active event' }, { status: 503 })
    eventId = event.id
  }

  // ── 1. one active application per person per event ──
  const { data: dupes } = await supabase.from('applications').select('id, business_name')
    .eq('event_id', eventId).ilike('email', likeExact(String(row.email)))
    .in('status', [...ACTIVE_APPLICATION_STATUSES])
  const other = (dupes ?? []).find(d => d.id !== id)
  if (other) {
    return NextResponse.json({ error: `${row.email} already has an active application for this event (${other.business_name.trim()}). One active application per person.`, errors: { email: 'Already has an active application.' } }, { status: 409 })
  }

  // ── 2. did the order change? frozen once money has moved ──
  const { data: invoices } = id
    ? await supabase.from('invoices').select('id, amount, amount_paid, status').eq('application_id', id)
    : { data: [] as { id: string; amount: number; amount_paid: number; status: string }[] }
  const invoice = invoices?.[0] ?? null
  const orderChanged = !existing
    || !samePricingInputs(existing, row as unknown as PricingInputs)
    || existing.agreed_total !== row.agreed_total
    || !!existing.comped_at !== !!comp?.booth || !!existing.permits_comped_at !== !!comp?.permits
  if (existing && orderChanged && invoice && (invoice.amount_paid ?? 0) > 0) {
    return NextResponse.json({ error: 'A payment has been recorded, so the booths, add-ons, artist count and price can no longer change here. Adjust the invoice in Invoices.' }, { status: 409 })
  }
  // Unchanged order: the stored price stands (it may predate today's prices).
  if (existing && !orderChanged) { delete row.total_amount; delete row.agreed_total }

  // ── insert or update ──
  let appId: string
  if (!id) {
    const { data, error } = await supabase.from('applications')
      .insert({ ...row, event_id: eventId, user_id: null, status: 'pending' } as never).select('id').single()
    if (error || !data) return NextResponse.json({ error: `The application did not save: ${error?.message ?? 'no row'}` }, { status: 500 })
    appId = data.id
  } else {
    const { data, error } = await supabase.from('applications').update(row as never).eq('id', id).select('id')
    if (error || !data?.length) return NextResponse.json({ error: `The application did not save: ${error?.message ?? 'no row'}` }, { status: 500 })
    appId = id
  }

  const problems: string[] = []

  // ── 3. comp (set_comp re-prices or creates the invoice it owns) ──
  const hadComp = !!existing?.comped_at || !!existing?.permits_comped_at
  if (orderChanged && (comp || hadComp)) {
    const { error } = await supabase.rpc('set_comp', { p_application_id: appId, p_booth: !!comp?.booth, p_permits: !!comp?.permits })
    if (error) problems.push(`the comp was not applied (${error.message})`)
  }

  // ── 4. status ──
  const { data: app } = await supabase.from('applications')
    .select('id, status, comped_at, permits_comped_at, total_amount, agreed_total, exhibitor_type, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count, is_veteran, add_ons')
    .eq('id', appId).single()
  if (!app) return NextResponse.json({ error: 'Saved, but the application could not be re-read' }, { status: 500 })
  const wantStatus = body.input.status === 'keep' ? app.status : body.input.status
  const comped = !!app.comped_at || !!app.permits_comped_at

  if (wantStatus === 'approved') {
    if (app.status !== 'approved') {
      const { error } = await supabase.from('applications').update(approvePayload(app, new Date(), FINAL_DUE_AT)).eq('id', appId)
      if (error) problems.push(`it was not approved (${error.message})`)
    }
    const amount = comped ? compInvoiceAmount(app) : app.agreed_total ?? app.total_amount
    const { data: inv } = await supabase.from('invoices').select('id, amount, amount_paid, status').eq('application_id', appId)
    const current = inv?.[0] ?? null
    if (!current && (!comped || amount > 0)) {
      const { error } = await supabase.from('invoices').insert({ application_id: appId, amount, amount_paid: 0, status: 'pending' })
      if (error) problems.push(`the invoice was not created (${error.message}); add it in Invoices`)
    } else if (orderChanged && current && !comped && current.amount !== amount) {
      const change = discountedInvoiceUpdate(current, amount, 0)
      if ('refused' in change) problems.push(`the invoice was not re-priced: ${change.refused}`)
      else {
        const { error } = await supabase.from('invoices').update({ amount: change.amount }).eq('id', current.id)
        if (error) problems.push(`the invoice was not re-priced (${error.message})`)
      }
    }
  } else if (wantStatus === 'pending' && app.status === 'approved') {
    const { error } = await supabase.from('applications').update(SEND_BACK_PAYLOAD).eq('id', appId)
    if (error) problems.push(`it was not moved back to pending (${error.message})`)
  }

  // ── 5. VIP Meet & Greet (098): sync by the uid the database gave each artist ──
  const vipProblem = await syncVip(supabase, appId, body.input)
  if (vipProblem) problems.push(vipProblem)
  // The public page caches the view (tag 'vip'); any save can change it (status, roster, ticks).
  revalidateTag('vip', { expire: 0 })
  revalidatePath('/events/vip-meet-greet')

  return NextResponse.json({ ok: true, id: appId, created: !id, problems })
}

/**
 * The planner keeps input.artists' order, so the stored roster's element i is
 * input artist i. Returns a problem to report, or null.
 */
async function syncVip(supabase: Awaited<ReturnType<typeof createServerClient>>, appId: string, input: EditorInput): Promise<string | null> {
  const wanted = input.exhibitor_type === 'artist' ? (input.artists ?? []).map(a => !!a.vip) : []
  const { data: current, error: readErr } = await supabase.from('vip_featured_artists').select('id, artist_uid').eq('application_id', appId)
  if (readErr) return wanted.some(Boolean) ? `the VIP Meet & Greet list was not updated (${readErr.message}; is migration 098 applied?)` : null
  const { data: saved } = await supabase.from('applications').select('artists').eq('id', appId).single()
  const roster = Array.isArray(saved?.artists) ? (saved.artists as Array<{ uid?: unknown }>) : []
  const want = new Set(roster.flatMap((a, i) => (wanted[i] && typeof a?.uid === 'string' ? [a.uid] : [])))
  const have = new Set((current ?? []).map(r => r.artist_uid))
  const drop = (current ?? []).filter(r => !want.has(r.artist_uid)).map(r => r.id)
  const add = [...want].filter(u => !have.has(u))
  if (drop.length) {
    const { error } = await supabase.from('vip_featured_artists').delete().in('id', drop)
    if (error) return `an artist was not removed from the VIP Meet & Greet (${error.message})`
  }
  if (add.length) {
    // New artists go to the end of the list; the order is set on /admin/vip.
    const { data: last } = await supabase.from('vip_featured_artists').select('display_order').order('display_order', { ascending: false }).limit(1)
    const start = (last?.[0]?.display_order ?? 0) + 1
    const { error } = await supabase.from('vip_featured_artists').insert(add.map((artist_uid, k) => ({ application_id: appId, artist_uid, display_order: start + k })))
    if (error) return `an artist was not added to the VIP Meet & Greet (${error.message})`
  }
  return null
}
