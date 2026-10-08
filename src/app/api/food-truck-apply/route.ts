import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { botTrapRejection } from '@/lib/bot-trap'
import { CONTACT_EMAIL } from '@/lib/event-config'
import { validateFoodTruckSubmission, applicantFilePath, describeDays } from '@/lib/food-truck-submission'
import { foodTruckReceivedEmail, internalNewFoodTruckEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import type { Database } from '@/types/database'

// POST /api/food-truck-apply - public food truck application (091).
// Spec: docs/superpowers/plans/2026-10-07-food-truck-application.md.
//
// Modelled on /api/sponsor-apply: bot trap first, server-side validation,
// service-role insert (no policy lets anon write food_trucks), then two
// receipts that never fail the request. The row is pending and unpublished;
// the fee is the shared day price, never a client value.
//
// FILES DO NOT PASS THROUGH HERE. Vercel caps a request body at about 4.5 MB
// and an applicant may send five 10 MB photos. The body carries a manifest
// (kind, type, size per file); the answer carries one signed upload URL per
// file, into the new truck's folder of food-truck-logos. The form uploads,
// then calls /api/food-truck-apply/files, which records what actually arrived.
//
// Applications are refused while events.food_truck_applications_open is off.
// One active application per email per event is 091's unique index; its
// 23505 becomes a sentence.
//
// NOT RATE LIMITED - same standing gap as the other public form routes
// (open item: Vercel WAF rules before launch).

const BUCKET = 'food-truck-logos'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Could not read that submission. Please try again.' }, { status: 400 })
  }

  // `website` is the honeypot and must be empty; the real one posts as websiteUrl.
  const trap = botTrapRejection(body)
  if (trap) {
    console.warn(`[food-truck-apply] rejected as automated: ${trap}`)
    return NextResponse.json({ error: 'We could not verify that submission. Please try again.' }, { status: 400 })
  }

  const v = validateFoodTruckSubmission(body)
  if (!v.ok) {
    return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors: v.fieldErrors }, { status: 400 })
  }
  const s = v.values

  const { data: event, error: eventErr } = await supabase.from('events')
    .select('id, food_truck_applications_open').eq('is_active', true).single()
  if (eventErr || !event) {
    console.error(`[food-truck-apply] no active event (${eventErr?.code ?? 'none'}): ${eventErr?.message ?? ''}`)
    return NextResponse.json({ error: 'Applications are temporarily unavailable. Please try again shortly.' }, { status: 503 })
  }
  if (!event.food_truck_applications_open) {
    return NextResponse.json({ error: 'Food truck applications are closed.', closed: true }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { data: row, error: insErr } = await supabase.from('food_trucks').insert({
    event_id: event.id,
    business_name: s.business_name,
    contact_name: s.contact_name,
    email: s.email,
    phone: s.phone,
    website: s.website,
    instagram: s.instagram,
    facebook: s.facebook,
    cuisine_type: s.cuisine_type,
    description: s.description,
    days: s.days,
    status: 'pending',
    is_published: false,
    applied_at: now,
    acknowledged_at: now,
  }).select('id').single()
  if (insErr || !row) {
    if (insErr?.code === '23505') {
      return NextResponse.json({
        error: `We already have an application from ${s.email} for this year. To change it, email ${CONTACT_EMAIL}.`,
        fieldErrors: { email: 'We already have an application from this email.' },
      }, { status: 409 })
    }
    console.error(`[food-truck-apply] insert failed (${insErr?.code ?? 'none'}): ${insErr?.message ?? 'no row'}`)
    return NextResponse.json({ error: `Your application did not save. Please try again or email ${CONTACT_EMAIL}.` }, { status: 500 })
  }
  const id = row.id

  // One signed upload URL per declared file. A failure here loses a picture,
  // never the application.
  // `index` is the file's place in the manifest (logo first, then photos).
  const uploads: { index: number; kind: string; path: string; token: string }[] = []
  for (const [index, f] of s.files.entries()) {
    const path = applicantFilePath(id, f, crypto.randomUUID())
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) console.error(`[food-truck-apply] ${id}: no upload URL for ${path}: ${error?.message ?? 'none'}`)
    else uploads.push({ index, kind: f.kind, path: data.path, token: data.token })
  }

  // Receipts. The row is saved; a mail failure is logged, never surfaced as a
  // failed submission (the applicant would resubmit into the unique index).
  const facts = { truckName: s.business_name, contactName: s.contact_name, cuisine: s.cuisine_type, days: describeDays(s.days), price: s.price }
  try {
    await sendTransactional(s.email, `We received your AATC 2027 food truck application - ${s.business_name}`, foodTruckReceivedEmail(facts))
  } catch (e) {
    console.error(`[food-truck-apply] ${id} saved but the applicant receipt failed: ${String(e)}`)
  }
  try {
    await sendTransactional(CONTACT_EMAIL, `New food truck application: ${s.business_name} (${s.cuisine_type}, ${describeDays(s.days)})`,
      internalNewFoodTruckEmail({
        ...facts, email: s.email, phone: s.phone, description: s.description,
        hasLogo: s.files.some(f => f.kind === 'logo'), photoCount: s.files.filter(f => f.kind === 'photo').length,
      }))
  } catch (e) {
    console.error(`[food-truck-apply] ${id} saved but the internal notice failed: ${String(e)}`)
  }

  return NextResponse.json({ id, uploads, uploadsMissing: s.files.length - uploads.length })
}
