// Presentation-only filter for the public sponsor surfaces.
//
// The database holds two deliberate test rows, named "ZZ TEST ... RLS Harness".
// They are NOT a mistake and must NOT be deleted or hidden with RLS.
//
// Their visibility to the anon role is the thing under test. Migration 027-030
// RLS coverage is asserted by scripts/verify-sponsor-visibility.mjs, and that
// script needs a live, anon-readable, confirmed sponsorship to assert against.
// Remove the rows and the assertion at verify-sponsor-visibility.mjs:131 does
// not fail - it goes vacuous, reporting PASS while proving nothing, because
// there is no longer a pending row for anon to be blocked from seeing. A test
// that cannot fail is worse than no test.
//
// So the row stays visible at the data layer and is filtered here, at the
// presentation layer, and only here. The reason this could not wait for the
// cutover teardown: sponsor_name is rendered as an image alt attribute, so a
// screen reader announces "ZZ TEST - RLS Harness (DELETE ME)" as a sponsor of
// the convention.
//
// Matched on the "ZZ TEST" prefix rather than the full name on purpose. The
// full name contains an em dash, and a repo-wide dash sweep once rewrote that
// same literal in supabase/seeds/, silently taking every teardown LIKE from two
// matches to zero. A prefix with no punctuation in it cannot be broken that way.
//
// The full harness (both sponsorships, the invoice, and the auth user) is
// removed at cutover via the FK-ordered block in
// supabase/seeds/rls_harness_records.sql:107-122. See docs/CUTOVER.md.

/**
 * Exported so a query that LIMITS can exclude harness rows server-side, before
 * the limit rather than after it. FooterSponsors used to `.limit(5)` and then
 * filter, so a harness row inside the window silently cost a real sponsor their
 * slot. The prefix stays defined once, here, whichever layer applies it.
 */
export const HARNESS_PREFIX = 'ZZ TEST'

export function isHarnessSponsor(sponsorName: string | null | undefined): boolean {
  return (sponsorName ?? '').trimStart().startsWith(HARNESS_PREFIX)
}

/** Drop the RLS harness rows from anything a visitor sees. Presentation only. */
export function excludeHarnessSponsors<T extends { sponsor_name: string | null }>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter(r => !isHarnessSponsor(r.sponsor_name))
}
