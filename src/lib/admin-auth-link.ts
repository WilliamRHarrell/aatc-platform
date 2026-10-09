import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SITE_URL } from '@/lib/site'
import { confirmUrl } from '@/lib/auth-confirm'

/**
 * An emailed account link made by the admin API, pointing at /auth/confirm
 * (Ryan, 2026-10-09). generateLink's own action_link is a Supabase /verify URL
 * that signs in on GET, so a mail scanner that opens it uses it up. Built from
 * the link's hashed_token instead, it verifies only on the Continue tap, on
 * any device (lib/auth-confirm.ts). Used by Invite & link, admin Reset
 * password and the returning-exhibitor invite. Creates the user for 'invite'.
 */
export type AdminLinkType = 'invite' | 'recovery'

export async function adminConfirmLink(svc: SupabaseClient<Database>, type: AdminLinkType, email: string) {
  const { data, error } = await svc.auth.admin.generateLink({ type, email, options: { redirectTo: `${SITE_URL}/auth/reset-password` } })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) return { ok: false as const, error: error?.message ?? 'no link returned', userId: data?.user?.id ?? null }
  // ?invited=1 lets /auth/reset-password say "Create your password" to a new account.
  const next = type === 'invite' ? '/auth/reset-password?invited=1' : '/auth/reset-password'
  return { ok: true as const, url: confirmUrl(SITE_URL, hashed, type, next), userId: data.user?.id ?? null }
}
