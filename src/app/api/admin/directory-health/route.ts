import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createServerClient } from '@/lib/supabase-server'

/**
 * Directory funnel counts for the admin dashboard.
 *
 * The last number is the point of this endpoint: `visible` is measured with a
 * genuine ANONYMOUS client, not by re-implementing the policy predicate. That
 * distinction is what makes it a real check — the 42P17 recursion went
 * unnoticed for twelve weeks precisely because nobody could see that "0 listed
 * publicly" disagreed with "12 approved", and any count derived from an
 * admin-authenticated query would have happily reported 12.
 *
 * If `visible` is lower than `depositPaid + overridden`, something is wrong at
 * the RLS layer and `error` will usually say what.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const service = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // Deliberately NOT the caller's session — an anonymous, cookieless client is
  // the only thing that measures what the public actually sees.
  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: apps } = await service
    .from('applications')
    .select('id, status, needs_roster, directory_override')

  const { data: invoices } = await service
    .from('invoices')
    .select('application_id, deposit_paid_at')

  const rows = apps ?? []
  const depositApps = new Set(
    (invoices ?? []).filter(i => i.deposit_paid_at && i.application_id).map(i => i.application_id)
  )

  const approved = rows.filter(a => a.status === 'approved')
  const rosterComplete = approved.filter(a => a.needs_roster === false)
  const depositPaid = rosterComplete.filter(a => depositApps.has(a.id))
  const overridden = rosterComplete.filter(a => a.directory_override === true && !depositApps.has(a.id))

  // The real measurement.
  const { data: publicRows, error: publicErr } = await anon
    .from('applications')
    .select('id')
    .eq('status', 'approved')

  const visible = publicRows?.length ?? 0
  const expected = depositPaid.length + overridden.length

  return NextResponse.json({
    approved: approved.length,
    rosterComplete: rosterComplete.length,
    depositPaid: depositPaid.length,
    overridden: overridden.length,
    visible,
    expected,
    healthy: !publicErr && visible === expected,
    error: publicErr ? `${publicErr.code}: ${publicErr.message}` : null,
  })
}
