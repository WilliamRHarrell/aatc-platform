import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'
import { SITE_URL } from '@/lib/site'
import { sendTransactional } from '@/lib/transactional-email'
import { accountInviteEmail, portalLinkedEmail } from '@/lib/email-templates'
import { ACTIVE_APPLICATION_STATUSES, canInvite, planInviteLink, type AccountFacts, type LinkKind } from '@/lib/invite-link'

/**
 * POST /api/admin/invite-link - "Invite & link" (and unlink) for a sponsorship
 * or an in-person application. Replaces /api/admin/link-sponsor, which could
 * only link an account that already existed. Rules: lib/invite-link.ts.
 *
 * body: { kind: 'sponsorship' | 'application' | 'food_truck', id, email }  or  { kind: 'sponsorship' | 'food_truck', id, unlink: true }
 *
 * - An account with that email that has been used: link it and send the short
 *   "now in your portal" email.
 * - One that was invited but never used: link it and send a fresh set-password
 *   link (resend).
 * - No account: create it by invitation (Supabase generateLink, which sends
 *   nothing itself), link it now, and send our branded invite. The link lands
 *   on /auth/reset-password, which sets the password and opens the portal.
 * - A row linked to a different account is refused: unlink first.
 * - An application is refused if the account already has another active
 *   application for the event (079's one-active index, checked first so the
 *   admin gets a sentence rather than a constraint error).
 *
 * The link is written before the email is sent. A failed send is reported
 * (emailSent: false), never undone: the admin can press it again to resend.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/
const WHAT: Record<LinkKind, string> = { sponsorship: 'sponsorship', application: 'booth application', food_truck: 'food truck' }

const admin = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function findAccount(svc: ReturnType<typeof admin>, email: string): Promise<AccountFacts | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Could not search accounts: ${error.message}`)
    const hit = data.users.find(u => u.email?.toLowerCase() === email)
    if (hit) return { id: hit.id, email_confirmed_at: hit.email_confirmed_at, last_sign_in_at: hit.last_sign_in_at }
    if (data.users.length < 1000) return null
  }
  throw new Error('Could not search accounts: more than 20,000 users')
}

export async function POST(req: Request) {
  const userClient = await createServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()

  const body = (await req.json().catch(() => ({}))) as { kind?: string; id?: string; email?: string; unlink?: boolean }
  const kind = body.kind === 'sponsorship' || body.kind === 'application' || body.kind === 'food_truck' ? body.kind : null
  if (!kind || !body.id) return NextResponse.json({ error: 'kind and id are required' }, { status: 400 })
  if (!canInvite(kind, profile?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = admin()

  // ── The row ───────────────────────────────────────────────
  let row: { id: string; name: string; user_id: string | null; email: string | null; event_id: string; status: string }
  if (kind === 'sponsorship') {
    const { data } = await svc.from('sponsorships').select('id, sponsor_name, user_id, email, event_id, status').eq('id', body.id).single()
    if (!data) return NextResponse.json({ error: 'Sponsorship not found' }, { status: 404 })
    row = { id: data.id, name: data.sponsor_name, user_id: data.user_id, email: data.email, event_id: data.event_id, status: data.status }
  } else if (kind === 'food_truck') {
    // Food trucks have no status; the one-active-application rule does not apply.
    const { data } = await svc.from('food_trucks').select('id, business_name, user_id, email, event_id').eq('id', body.id).single()
    if (!data) return NextResponse.json({ error: 'Food truck not found' }, { status: 404 })
    row = { id: data.id, name: data.business_name.trim(), user_id: data.user_id, email: data.email, event_id: data.event_id, status: 'approved' }
  } else {
    const { data } = await svc.from('applications').select('id, business_name, user_id, email, event_id, status').eq('id', body.id).single()
    if (!data) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    row = { id: data.id, name: data.business_name.trim(), user_id: data.user_id, email: data.email, event_id: data.event_id, status: data.status }
  }
  const table = kind === 'sponsorship' ? 'sponsorships' : kind === 'food_truck' ? 'food_trucks' : 'applications'

  // ── Unlink ────────────────────────────────────────────────
  if (body.unlink) {
    // Sponsorships only. An application's user_id is usually the applicant's
    // own sign-up; unlinking it here would cut them off from their portal.
    if (kind === 'application') return NextResponse.json({ error: 'Applications are not unlinked here' }, { status: 400 })
    const { data, error } = await svc.from(table).update({ user_id: null }).eq('id', row.id).select('id')
    if (error || !data?.length) return NextResponse.json({ error: `Unlink did not save${error ? `: ${error.message}` : ''}` }, { status: 500 })
    return NextResponse.json({ ok: true, unlinked: true })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Enter one valid email address' }, { status: 400 })

  let account: AccountFacts | null
  try { account = await findAccount(svc, email) } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
  const plan = planInviteLink(row.user_id, account)
  if (plan.action === 'conflict') {
    return NextResponse.json({ error: `This ${WHAT[kind]} is already linked to a different account. Unlink it first.` }, { status: 409 })
  }

  // ── One active application per account per event (079) ────
  if (kind === 'application' && plan.action !== 'invite_new' && (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(row.status)) {
    const { data: other } = await svc.from('applications').select('business_name')
      .eq('user_id', plan.userId).eq('event_id', row.event_id).neq('id', row.id)
      .in('status', [...ACTIVE_APPLICATION_STATUSES])
    if (other?.length) {
      return NextResponse.json({ error: `${email} already has an active application for this event (${other[0].business_name.trim()}). One active application per account.` }, { status: 409 })
    }
  }

  // ── Account and link ──────────────────────────────────────
  const redirectTo = `${SITE_URL}/auth/reset-password`
  let userId: string
  let actionUrl: string | null = null
  let created = false
  if (plan.action === 'invite_new') {
    const { data, error } = await svc.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
    if (error || !data?.user || !data.properties?.action_link) {
      return NextResponse.json({ error: `Could not create the invitation: ${error?.message ?? 'no link returned'}` }, { status: 500 })
    }
    userId = data.user.id
    actionUrl = data.properties.action_link
    created = true
  } else {
    userId = plan.userId
    if (plan.action === 'resend_invite') {
      const { data, error } = await svc.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      if (error || !data?.properties?.action_link) {
        return NextResponse.json({ error: `Could not create a new link: ${error?.message ?? 'no link returned'}` }, { status: 500 })
      }
      actionUrl = data.properties.action_link
    }
  }

  // A sponsorship with no contact email takes this one (reminders need it).
  const patch = kind === 'sponsorship' && !row.email ? { user_id: userId, email } : { user_id: userId }
  const { data: linked, error: linkErr } = await svc.from(table).update(patch).eq('id', row.id).select('id')
  if (linkErr || !linked?.length) {
    // Never leave a freshly invited account behind with nothing linked to it.
    if (created) await svc.auth.admin.deleteUser(userId).catch(() => undefined)
    const msg = linkErr?.code === '23505'
      ? 'That account already has an active application for this event. One active application per account.'
      : `The link did not save${linkErr ? `: ${linkErr.message}` : ''}`
    return NextResponse.json({ error: msg }, { status: linkErr?.code === '23505' ? 409 : 500 })
  }

  // ── Email ─────────────────────────────────────────────────
  let emailSent = true
  try {
    if (actionUrl) {
      await sendTransactional(email, `Your AATC 2027 portal account - ${row.name}`, accountInviteEmail({ name: row.name, what: WHAT[kind], actionUrl }))
    } else {
      await sendTransactional(email, `Your AATC 2027 ${WHAT[kind]} is in your portal - ${row.name}`, portalLinkedEmail({ name: row.name, what: WHAT[kind] }))
    }
  } catch (e) {
    emailSent = false
    console.error(`[invite-link] ${kind} ${row.id} linked to ${userId} but the email failed: ${String(e)}`)
  }

  return NextResponse.json({ ok: true, action: plan.action, userId, emailSent })
}
