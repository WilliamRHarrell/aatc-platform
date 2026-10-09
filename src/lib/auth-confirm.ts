/**
 * /auth/confirm: emailed auth links that work on ANY device, and survive email
 * scanners (Ryan, 2026-10-09).
 *
 * The link carries a one-time token hash (`token_hash`) instead of a PKCE code.
 * Opening it shows a "Continue" button; only the tap (a POST) verifies the
 * token on the server (verifyOtp) and sets the session cookie on the device
 * that tapped. Nothing is verified on GET, so a mail scanner that opens the
 * link does not use it up. A PKCE `?code=` link only worked in the browser
 * that asked for it; this does not depend on the browser at all.
 */
export const CONFIRM_TYPES = ['email', 'signup', 'recovery', 'invite'] as const
export type ConfirmType = (typeof CONFIRM_TYPES)[number]
export const isConfirmType = (v: unknown): v is ConfirmType => typeof v === 'string' && (CONFIRM_TYPES as readonly string[]).includes(v)

/** Where each kind of link lands after a successful tap. */
export const DEFAULT_NEXT: Record<ConfirmType, string> = {
  email: '/apply',
  signup: '/apply',
  recovery: '/auth/reset-password',
  invite: '/auth/reset-password',
}

/** Same-site paths only: never another host, never a protocol-relative URL. */
export function safeNext(next: unknown, type: ConfirmType): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : DEFAULT_NEXT[type]
}

/** What the button heading says for each kind of link. */
export const CONFIRM_LABEL: Record<ConfirmType, { heading: string; button: string }> = {
  email: { heading: 'Confirm your email', button: 'Continue' },
  signup: { heading: 'Confirm your email', button: 'Continue' },
  recovery: { heading: 'Reset your password', button: 'Continue' },
  invite: { heading: 'Set up your account', button: 'Continue' },
}

/** A /auth/confirm link, for the app's own emails (admin reset, Invite & link). */
export function confirmUrl(siteUrl: string, tokenHash: string, type: ConfirmType, next?: string): string {
  const u = new URL('/auth/confirm', siteUrl)
  u.searchParams.set('token_hash', tokenHash)
  u.searchParams.set('type', type)
  if (next) u.searchParams.set('next', next)
  return u.toString()
}

/** The same link as a Supabase email-template string (the dashboard fills the variables). */
export function confirmTemplateUrl(type: ConfirmType, next: string): string {
  return `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`
}
