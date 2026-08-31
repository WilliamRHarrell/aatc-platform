/**
 * Admin role model - the single source for who may reach which /admin path.
 *
 * IMPORTANT, and stated plainly: this is a NAVIGATION-LEVEL split only. RLS
 * still says `is_admin()` on every admin write policy, so a content_editor or
 * sponsorship_manager who knows the API can still read data their sidebar does
 * not show them - including artist government photo IDs, the most sensitive
 * data in the system. Part 2 of the role split (column-level protection) is the
 * remedy. See docs/CUTOVER.md.
 *
 * Consequence: only give these roles to people you would otherwise have made
 * full admins. It stops mistakes and reduces incidental exposure; it is not a
 * security boundary against someone who goes looking.
 */
export type AdminRole = 'admin' | 'content_editor' | 'sponsorship_manager'

export const ADMIN_ROLES: AdminRole[] = ['admin', 'content_editor', 'sponsorship_manager']

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Full admin',
  content_editor: 'Content editor',
  sponsorship_manager: 'Sponsorship manager',
}

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  admin: 'Everything, including applications, payments and artist ID documents.',
  content_editor: 'Site copy, panels, contests, food trucks, social queue, booth packets. No payments, no applications, no ID documents.',
  sponsorship_manager: 'Sponsorships and invoicing. No applications and no artist ID documents.',
}

/**
 * Paths each role may reach. Matched by prefix, longest first.
 * `/admin` itself (the dashboard) is allowed for every admin role.
 */
const PATHS: Record<AdminRole, string[] | '*'> = {
  admin: '*',
  content_editor: [
    '/admin/content',
    // page_images was widened to content_editor by migration 054, TABLE AND
    // BUCKET both - an editor who could set image_path but not upload the file
    // it names would produce nothing but a broken image.
    '/admin/page-images',
    // '/admin/schedule' is STILL not here, but the reason has changed and the
    // old one is no longer true. It used to be that schedule_items carried only
    // `schedule_items: admin all`, so an editor would have reached the page,
    // seen an empty schedule and had every write refused. Migration 054 gave
    // schedule_items an editorial policy, so that precondition is now met and
    // adding this line would work.
    //
    // It is left out because granting a role a new screen is a decision, not a
    // side effect of a migration that happened to widen a table. Flagged for
    // Ryan rather than taken - see HANDOFF.
    '/admin/panels',
    '/admin/contests',
    '/admin/food-trucks',
    '/admin/aatc-queue',
    '/admin/aatc-generator',
    // Read-only, and exactly what a venue staffer or marketing person needs.
    '/admin/print',
  ],
  sponsorship_manager: [
    '/admin/sponsorships',
    // Needed to record a sponsor payment - payment recording lives only here.
    // Caveat: this page also lists application invoices. Under a UI-only split
    // that cannot be filtered server-side, so a sponsorship_manager sees
    // exhibitor invoice totals too. Accepted; noted in CUTOVER.md.
    '/admin/invoices',
  ],
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as string[]).includes(role)
}

/** May this role reach this /admin path? */
export function canAccess(role: string | null | undefined, pathname: string): boolean {
  if (!isAdminRole(role)) return false
  const allowed = PATHS[role]
  if (allowed === '*') return true
  if (pathname === '/admin') return true // dashboard landing
  return allowed.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * First path a role is allowed to see - where to send them after login.
 *
 * Non-admins go to `/portal`, not `/apply`. `/apply` is the public hub that
 * explains what you can apply for; `/portal` is the signed-in home, and it
 * handles the no-application case with its own empty state pointing back at
 * the three apply routes. Sending a returning exhibitor to `/apply` made them
 * navigate to their own booth details.
 */
export function landingPath(role: string | null | undefined): string {
  if (!isAdminRole(role)) return '/portal'
  const allowed = PATHS[role]
  return allowed === '*' ? '/admin' : (allowed[0] ?? '/admin')
}
