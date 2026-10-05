/**
 * Invite & link: connect a sponsorship, an in-person application or a food
 * truck (090, 2026-10-05) to a portal account, creating the account by
 * invitation when none exists.
 *
 * REVERSES A DECISION (Ryan, 2026-09-28). /api/admin/link-sponsor refused to
 * create accounts ("minting a login the sponsor never asked for"). Ryan wants
 * the admin to be able to invite: the account is created in an invited state
 * for the address the admin types, linked at once, and only usable by whoever
 * opens the emailed link. Pure rules here; the route does the I/O.
 */
export type LinkKind = 'sponsorship' | 'application' | 'food_truck'

/** admin + sponsorship_manager on sponsorships; admin only on applications and food trucks. */
export const INVITE_ROLES: Record<LinkKind, readonly string[]> = {
  sponsorship: ['admin', 'sponsorship_manager'],
  application: ['admin'],
  food_truck: ['admin'],
}

export function canInvite(kind: LinkKind, role: string | null | undefined): boolean {
  return !!role && INVITE_ROLES[kind].includes(role)
}

/** Mirrors applications_one_active_per_user_event (079). */
export const ACTIVE_APPLICATION_STATUSES = ['pending', 'approved', 'waitlisted'] as const

export interface AccountFacts {
  id: string
  email_confirmed_at?: string | null
  last_sign_in_at?: string | null
}

/** Has anyone ever actually used this account? An invited-only one has not. */
export function isActivated(a: AccountFacts): boolean {
  return !!(a.email_confirmed_at || a.last_sign_in_at)
}

export type InvitePlan =
  | { action: 'conflict' }                       // row linked to a different account
  | { action: 'link_existing'; userId: string }  // live account: link + "now in your portal"
  | { action: 'resend_invite'; userId: string }  // account never used: link + fresh set-password link
  | { action: 'invite_new' }                     // no account: create by invitation, link, invite

export function planInviteLink(rowUserId: string | null, account: AccountFacts | null): InvitePlan {
  if (account) {
    if (rowUserId && rowUserId !== account.id) return { action: 'conflict' }
    return isActivated(account) ? { action: 'link_existing', userId: account.id } : { action: 'resend_invite', userId: account.id }
  }
  // No account has this email; a linked row belongs to someone else's address.
  return rowUserId ? { action: 'conflict' } : { action: 'invite_new' }
}
