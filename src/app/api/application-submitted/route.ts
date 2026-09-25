import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import { CONTACT_EMAIL } from '@/lib/event-config'
import { applicationReceiptFacts } from '@/lib/application-receipt'
import { applicationReceivedEmail, internalNewApplicationEmail } from '@/lib/email-templates'
import { sendTransactional } from '@/lib/transactional-email'
import type { Database } from '@/types/database'

// POST /api/application-submitted { applicationId }
//
// The booth forms insert from the browser as the signed-in applicant, so
// the receipt is sent here, after the insert. Rules:
//   - the caller must be signed in and must OWN the application (the read
//     goes through the cookie client, so "applications: own read" decides);
//   - ONCE per application: a compare-and-set on submission_receipt_sent_at
//     (077) with the service role. A second call, or a race, sends nothing.
//     Fail closed: if the mark cannot be recorded, nothing is sent;
//   - a mail failure is logged, never returned as an error (the row is the
//     source of truth and the mark is already set).

const COLS = 'id, business_name, contact_name, email, phone, exhibitor_type, booth_size, artist_single_qty, artist_double_qty, vendor_single_qty, vendor_double_qty, corner_count, artist_count, is_veteran, total_amount, submission_receipt_sent_at'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { applicationId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const id = typeof body.applicationId === 'string' ? body.applicationId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Ownership: the cookie client only returns rows the caller may read.
  const { data: app, error: readErr } = await supabase.from('applications').select(COLS).eq('id', id).eq('user_id', user.id).maybeSingle()
  if (readErr) {
    if (readErr.code === '42703') return NextResponse.json({ error: 'Receipts are not enabled yet (migration 077)' }, { status: 503 })
    console.error(`[application-submitted] read ${readErr.code}: ${readErr.message}`)
    return NextResponse.json({ error: 'Could not read the application' }, { status: 500 })
  }
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.submission_receipt_sent_at) return NextResponse.json({ sent: false, alreadySent: true })

  // Compare-and-set with the service role: the only writer of this column.
  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: marked, error: markErr } = await admin.from('applications')
    .update({ submission_receipt_sent_at: new Date().toISOString() })
    .eq('id', id).is('submission_receipt_sent_at', null)
    .select('id')
  if (markErr) {
    console.error(`[application-submitted] mark ${markErr.code}: ${markErr.message}`)
    return NextResponse.json({ error: 'Could not record the receipt' }, { status: 500 })
  }
  if (!marked || marked.length === 0) return NextResponse.json({ sent: false, alreadySent: true })

  const facts = applicationReceiptFacts(app)
  try {
    await sendTransactional(facts.email, `We received your AATC 2027 ${facts.kind.toLowerCase()} application - ${facts.businessName}`, applicationReceivedEmail(facts))
  } catch (e) {
    console.error(`[application-submitted] ${id} marked but the applicant receipt failed: ${String(e)}`)
  }
  try {
    await sendTransactional(CONTACT_EMAIL, `New ${facts.kind.toLowerCase()} application: ${facts.businessName} (${facts.booths}, ${facts.total})`, internalNewApplicationEmail(facts, id))
  } catch (e) {
    console.error(`[application-submitted] ${id} marked but the internal notice failed: ${String(e)}`)
  }
  return NextResponse.json({ sent: true })
}
