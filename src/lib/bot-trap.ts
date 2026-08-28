// Shared bot filter for the two anonymous public write paths:
// /api/pinup-entry and /api/panel-register.
//
// This is NOT the rate limit. Rate limiting is a Vercel WAF rule configured in
// the dashboard (5 requests / 60s per IP, deny) on both paths - see
// docs/HANDOFF.md. Nothing in this repo enforces a request rate, so code alone
// reads as unprotected. This file is a cheap complement that catches the naive
// end of the traffic before it reaches the database.
//
// Both signals are client-supplied and therefore forgeable. That is acceptable
// and deliberate: the WAF is the control, this is the filter. A bot that forges
// both is a bot that was written for this site specifically, and the rate limit
// is what stops that one. The value here is that the overwhelming majority of
// form spam is generic, fills every input it finds, and posts instantly.

/** Minimum plausible time to fill a form in. Below this, it was not typed. */
export const MIN_SUBMIT_MS = 2000

export interface BotTrapFields {
  /** Honeypot. Named to look worth filling in; must arrive empty. */
  website?: unknown
  /** Milliseconds between the form mounting and the submit. */
  elapsedMs?: unknown
}

/**
 * Returns a short reason string when the submission looks automated, or null
 * when it should proceed. The reason is for the server log only - the caller
 * must not return it to the client, because telling a bot which signal caught
 * it is how the next attempt avoids both.
 */
export function botTrapRejection(body: BotTrapFields): string | null {
  const honeypot = typeof body.website === 'string' ? body.website.trim() : ''
  if (honeypot.length > 0) return `honeypot filled (${honeypot.slice(0, 40)})`

  // Absent rather than fast: an older cached page, or a client that did not
  // send the field, must not be rejected. Only an explicit, implausibly small
  // number is treated as a signal.
  if (typeof body.elapsedMs === 'number' && Number.isFinite(body.elapsedMs)) {
    if (body.elapsedMs >= 0 && body.elapsedMs < MIN_SUBMIT_MS) {
      return `submitted in ${Math.round(body.elapsedMs)}ms, under the ${MIN_SUBMIT_MS}ms floor`
    }
  }

  return null
}
