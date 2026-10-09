import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ACTIVE_APPLICATION_STATUSES, planInviteLink, type AccountFacts, type InvitePlan, type LinkKind } from '@/lib/invite-link'
import { adminConfirmLink } from '@/lib/admin-auth-link'

/**
 * The I/O half of Invite & link: find or create the account and write the
 * link. Shared by /api/admin/invite-link (the admin button) and food truck
 * approval (/api/admin/food-trucks/decision, decision 3: approval invites).
 * Each caller sends its own email. Rules: lib/invite-link.ts.
 */
type Svc = SupabaseClient<Database>

export const LINK_WHAT: Record<LinkKind, string> = { sponsorship: 'sponsorship', application: 'booth application', food_truck: 'food truck' }
const TABLE: Record<LinkKind, 'sponsorships' | 'applications' | 'food_trucks'> = { sponsorship: 'sponsorships', application: 'applications', food_truck: 'food_trucks' }

export interface LinkRow { id: string; name: string; user_id: string | null; email: string | null; event_id: string; status: string }

export type LinkResult =
  | { ok: true; plan: Exclude<InvitePlan, { action: 'conflict' }>['action']; userId: string; actionUrl: string | null }
  | { ok: false; status: number; error: string }

async function findAccount(svc: Svc, email: string): Promise<AccountFacts | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Could not search accounts: ${error.message}`)
    const hit = data.users.find(u => u.email?.toLowerCase() === email)
    if (hit) return { id: hit.id, email_confirmed_at: hit.email_confirmed_at, last_sign_in_at: hit.last_sign_in_at }
    if (data.users.length < 1000) return null
  }
  throw new Error('Could not search accounts: more than 20,000 users')
}

/**
 * - An account with that email that has been used: link it (no action URL).
 * - One that was invited but never used: link it, with a fresh set-password link.
 * - No account: create it by invitation (Supabase generateLink, which sends
 *   nothing itself) and link it. The link lands on /auth/reset-password.
 * - A row linked to a different account is refused: unlink first.
 * - An application is refused if the account already has another active
 *   application for the event (079's one-active index, checked first so the
 *   admin gets a sentence rather than a constraint error).
 * `email` must already be trimmed, lower-cased and valid.
 */
export async function linkAccount(svc: Svc, kind: LinkKind, row: LinkRow, email: string): Promise<LinkResult> {
  let account: AccountFacts | null
  try { account = await findAccount(svc, email) } catch (e) {
    return { ok: false, status: 500, error: String(e instanceof Error ? e.message : e) }
  }
  const plan = planInviteLink(row.user_id, account)
  if (plan.action === 'conflict') {
    return { ok: false, status: 409, error: `This ${LINK_WHAT[kind]} is already linked to a different account. Unlink it first.` }
  }

  // ── One active application per account per event (079) ────
  if (kind === 'application' && plan.action !== 'invite_new' && (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(row.status)) {
    const { data: other } = await svc.from('applications').select('business_name')
      .eq('user_id', plan.userId).eq('event_id', row.event_id).neq('id', row.id)
      .in('status', [...ACTIVE_APPLICATION_STATUSES])
    if (other?.length) {
      return { ok: false, status: 409, error: `${email} already has an active application for this event (${other[0].business_name.trim()}). One active application per account.` }
    }
  }

  // ── Account and link ──────────────────────────────────────
  let userId: string
  let actionUrl: string | null = null
  let created = false
  if (plan.action === 'invite_new') {
    // /auth/confirm link (lib/admin-auth-link.ts): verifies on a tap, any device.
    const link = await adminConfirmLink(svc, 'invite', email)
    if (!link.ok || !link.userId) {
      return { ok: false, status: 500, error: `Could not create the invitation: ${link.ok ? 'no user returned' : link.error}` }
    }
    userId = link.userId
    actionUrl = link.url
    created = true
  } else {
    userId = plan.userId
    if (plan.action === 'resend_invite') {
      const link = await adminConfirmLink(svc, 'recovery', email)
      if (!link.ok) return { ok: false, status: 500, error: `Could not create a new link: ${link.error}` }
      actionUrl = link.url
    }
  }

  // A sponsorship with no contact email takes this one (reminders need it).
  const patch = kind === 'sponsorship' && !row.email ? { user_id: userId, email } : { user_id: userId }
  const { data: linked, error: linkErr } = await svc.from(TABLE[kind]).update(patch).eq('id', row.id).select('id')
  if (linkErr || !linked?.length) {
    // Never leave a freshly invited account behind with nothing linked to it.
    if (created) await svc.auth.admin.deleteUser(userId).catch(() => undefined)
    const dup = linkErr?.code === '23505'
    return {
      ok: false,
      status: dup ? 409 : 500,
      error: dup
        ? 'That account already has an active application for this event. One active application per account.'
        : `The link did not save${linkErr ? `: ${linkErr.message}` : ''}`,
    }
  }
  return { ok: true, plan: plan.action, userId, actionUrl }
}
