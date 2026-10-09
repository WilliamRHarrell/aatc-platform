/**
 * What an emailed auth link left in the URL when it landed on our page.
 *
 * WHY THIS EXISTS (2026-10-08, after the domain cutover): the browser client
 * (@supabase/auth-helpers-nextjs createBrowserClient) runs the PKCE flow. Links
 * made by the admin API (generateLink: admin "Reset password", Invite & link)
 * do not use PKCE: Supabase verifies them and redirects with the session in
 * the HASH (#access_token=...&refresh_token=...&type=recovery|invite). A PKCE
 * client refuses that URL ("Not a valid PKCE flow url."), creates no session,
 * and /auth/reset-password waited forever on "Verifying your reset link...".
 * Reproduced on the live site with a fresh link; it was never domain-specific.
 *
 * A link that was already used (a second click, or an email scanner that
 * opened it first) or has expired lands with #error=access_denied&
 * error_code=otp_expired&error_description=... instead.
 *
 * Self-service links (forgot-password, signup) are PKCE: they land with
 * ?code=..., which only the browser that asked for the email can exchange.
 */
export type AuthLanding =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'error'; code: string | null; description: string | null }
  | { kind: 'code' }
  | { kind: 'none' }

export function parseAuthLanding(href: string): AuthLanding {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = url.searchParams
  const err = (p: URLSearchParams) => p.get('error') || p.get('error_code') || p.get('error_description')
  if (err(hash)) return { kind: 'error', code: hash.get('error_code'), description: hash.get('error_description') }
  if (err(query)) return { kind: 'error', code: query.get('error_code'), description: query.get('error_description') }
  const accessToken = hash.get('access_token'), refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken, type: hash.get('type') }
  if (query.get('code')) return { kind: 'code' }
  return { kind: 'none' }
}

/** How long the reset page waits for a session before saying the link failed. */
export const AUTH_LINK_TIMEOUT_MS = 10_000
