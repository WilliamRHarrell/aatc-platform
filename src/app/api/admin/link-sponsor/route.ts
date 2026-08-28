import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Link (or unlink) a sponsorship to a user account.
 *
 * REPLACES THE REMOVED SELF-CLAIM. The old flow matched a sponsorship to a
 * signed-in user by EMAIL ALONE, with no verification - anyone who knew a
 * sponsor's address could claim their row and read a negotiated amount and
 * contact details. It also never worked, because `sponsorships` has no owner
 * UPDATE policy, so RLS filtered the write to zero rows silently.
 *
 * This is the deliberate replacement: an admin decides the link. With ~15
 * sponsors it does not need to scale, and the failure mode of getting it wrong
 * is bounded by a human doing it on purpose rather than an unverified match.
 *
 * Migration 049 adds the owner UPDATE policy this link makes meaningful, and
 * clamps it to contact details, website, socials and logo - a linked sponsor
 * can never change their own tier, amount, status or placement.
 */
export async function POST(req: Request) {
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

  const body = (await req.json()) as { sponsorshipId?: string; email?: string; unlink?: boolean }
  if (!body.sponsorshipId) {
    return NextResponse.json({ error: 'sponsorshipId is required' }, { status: 400 })
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Unlink ────────────────────────────────────────────────
  if (body.unlink) {
    const { data, error } = await admin
      .from('sponsorships')
      .update({ user_id: null })
      .eq('id', body.sponsorshipId)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Sponsorship not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, unlinked: true })
  }

  if (!body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  const email = body.email.trim().toLowerCase()

  // ── Find the account ──────────────────────────────────────
  // No user is created here, deliberately. Linking a sponsorship to an account
  // that does not exist would mean minting a login the sponsor never asked for
  // and cannot access - the account has to exist first, which means they have
  // signed up and the address is theirs.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    return NextResponse.json({ error: `Could not search accounts: ${listErr.message}` }, { status: 500 })
  }

  const match = list.users.find(u => u.email?.toLowerCase() === email)
  if (!match) {
    return NextResponse.json(
      { error: `No account exists for ${email}. Ask them to sign up first, then link.`, noAccount: true },
      { status: 404 }
    )
  }

  // ── Refuse to steal a link ────────────────────────────────
  // One account holding two sponsorships is legitimate (an agency, a parent
  // company). Silently moving a link off another sponsorship is not - so the
  // check is on THIS row already being linked elsewhere, not on the account.
  const { data: existing } = await admin
    .from('sponsorships')
    .select('id, sponsor_name, user_id')
    .eq('id', body.sponsorshipId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Sponsorship not found' }, { status: 404 })
  }
  if (existing.user_id && existing.user_id !== match.id) {
    return NextResponse.json(
      { error: 'This sponsorship is already linked to a different account. Unlink it first.' },
      { status: 409 }
    )
  }

  const { data, error } = await admin
    .from('sponsorships')
    .update({ user_id: match.id })
    .eq('id', body.sponsorshipId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Link did not save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: match.id, email: match.email })
}
