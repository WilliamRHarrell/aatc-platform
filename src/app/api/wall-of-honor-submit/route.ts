import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { botTrapRejection } from '@/lib/bot-trap'
import { WALL_OF_HONOR_EMAIL } from '@/lib/event-config'
import { validateWallOfHonorSubmission, entryPhotoPath, WOH_SUBMISSIONS_BUCKET } from '@/lib/wall-of-honor-submission'
import { wallOfHonorReceivedEmail, internalNewWallOfHonorEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import type { Database } from '@/types/database'

// POST /api/wall-of-honor-submit - public Wall of Honor tribute (104).
//
// Modelled on /api/food-truck-apply (091/093): bot trap first, server-side
// validation, service-role insert (no policy lets anon write
// wall_of_honor_entries), then two receipts that never fail the request. The
// row is pending and unpublished; consent_at is stamped by the database and
// never sent from here.
//
// FILES DO NOT PASS THROUGH HERE. Vercel caps a request body at about 4.5 MB
// and a family may send three 10 MB photos. The body carries a manifest
// (extension and type per photo); the answer carries one signed upload URL per
// photo, into the entry's folder in the PRIVATE wall-of-honor-submissions
// bucket. The form uploads, then calls /api/wall-of-honor-submit/files, which
// records what actually arrived.
//
// Submissions are refused while events.wall_of_honor_open is off. One active
// tribute per submitter email per honoree per event is 104's unique index; its
// 23505 becomes a sentence.
//
// NOT RATE LIMITED in code. ONE Vercel WAF rule (path starts with
// /api/wall-of-honor-submit, POST, 5/60s per IP, Deny) covers this route and
// /files; Ryan verifies it by observation before events.wall_of_honor_open is
// switched on (pinup precedent in event-config). Renaming these paths silently
// abandons the WAF rule; CUTOVER.md B2 lists it.

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Could not read that submission. Please try again.' }, { status: 400 })
  }

  // `website` is the honeypot and must be empty.
  const trap = botTrapRejection(body)
  if (trap) {
    console.warn(`[wall-of-honor-submit] rejected as automated: ${trap}`)
    return NextResponse.json({ error: 'We could not verify that submission. Please try again.' }, { status: 400 })
  }

  const v = validateWallOfHonorSubmission(body)
  if (!v.ok) {
    return NextResponse.json({ error: 'Please check the highlighted fields.', fieldErrors: v.fieldErrors }, { status: 400 })
  }
  const s = v.values

  const { data: event, error: eventErr } = await supabase.from('events')
    .select('id, wall_of_honor_open').eq('is_active', true).single()
  if (eventErr || !event) {
    console.error(`[wall-of-honor-submit] no active event (${eventErr?.code ?? 'none'}): ${eventErr?.message ?? ''}`)
    return NextResponse.json({ error: 'Submissions are temporarily unavailable. Please try again shortly.' }, { status: 503 })
  }
  if (!event.wall_of_honor_open) {
    return NextResponse.json({ error: 'Wall of Honor submissions are closed.', closed: true }, { status: 403 })
  }

  // No consent_at: the database stamps it, and a supplied value is overwritten.
  const { data: row, error: insErr } = await supabase.from('wall_of_honor_entries').insert({
    event_id: event.id,
    status: 'pending',
    is_published: false,
    honoree_name: s.honoree_name,
    honoree_rank: s.honoree_rank,
    branch: s.branch,
    unit: s.unit,
    service_years: s.service_years,
    tribute: s.tribute,
    submitter_name: s.submitter_name,
    submitter_relationship: s.submitter_relationship,
    submitter_email: s.submitter_email,
    submitter_phone: s.submitter_phone,
    consent_social: s.consent_social,
  }).select('id').single()
  if (insErr || !row) {
    if (insErr?.code === '23505') {
      return NextResponse.json({
        error: `We already have a tribute for ${s.honoree_name} from this email. To change it, email ${WALL_OF_HONOR_EMAIL}.`,
        fieldErrors: { email: 'We already have a tribute for this honoree from this email.' },
      }, { status: 409 })
    }
    console.error(`[wall-of-honor-submit] insert failed (${insErr?.code ?? 'none'}): ${insErr?.message ?? 'no row'}`)
    return NextResponse.json({ error: `Your tribute did not save. Please try again or email ${WALL_OF_HONOR_EMAIL}.` }, { status: 500 })
  }
  const id = row.id

  // One signed upload URL per declared photo. A failure here loses a picture,
  // never the tribute.
  const uploads: { index: number; path: string; token: string }[] = []
  for (const [index, f] of s.photos.entries()) {
    const path = entryPhotoPath(id, index, f.ext, crypto.randomUUID())
    const { data, error } = await supabase.storage.from(WOH_SUBMISSIONS_BUCKET).createSignedUploadUrl(path)
    if (error || !data) console.error(`[wall-of-honor-submit] ${id}: no upload URL for ${WOH_SUBMISSIONS_BUCKET}/${path}: ${error?.message ?? 'none'}`)
    else uploads.push({ index, path: data.path, token: data.token })
  }

  // Receipts. The row is saved; a mail failure is logged, never surfaced as a
  // failed submission (the family would resubmit into the unique index).
  try {
    await sendTransactional(s.submitter_email, `We received your Wall of Honor tribute - ${s.honoree_name}`,
      wallOfHonorReceivedEmail({ honoreeName: s.honoree_name, submitterName: s.submitter_name }))
  } catch (e) {
    console.error(`[wall-of-honor-submit] ${id} saved but the submitter receipt failed: ${String(e)}`)
  }
  try {
    await sendTransactional(WALL_OF_HONOR_EMAIL, `New Wall of Honor tribute: ${s.honoree_name} (${s.branch})`,
      internalNewWallOfHonorEmail({
        honoreeName: s.honoree_name, branch: s.branch, submitterName: s.submitter_name,
        relationship: s.submitter_relationship, email: s.submitter_email, phone: s.submitter_phone,
        photoCount: s.photos.length,
      }))
  } catch (e) {
    console.error(`[wall-of-honor-submit] ${id} saved but the internal notice failed: ${String(e)}`)
  }

  return NextResponse.json({ id, uploads, uploadsMissing: s.photos.length - uploads.length })
}
