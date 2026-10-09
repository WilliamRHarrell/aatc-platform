import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isConfirmType, safeNext } from '@/lib/auth-confirm'

/**
 * POST /auth/confirm/verify - the "Continue" tap on /auth/confirm (lib/auth-confirm.ts).
 * Verifies the one-time token on the server and sets the session cookie on
 * this device, then redirects (303) to the link's destination. POST only: a
 * GET (a mail scanner, a link preview) never reaches verifyOtp.
 */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin
  const form = await req.formData().catch(() => null)
  const tokenHash = form?.get('token_hash')
  const type = form?.get('type')
  if (typeof tokenHash !== 'string' || !tokenHash || !isConfirmType(type)) {
    return NextResponse.redirect(`${origin}/auth/confirm?error=invalid`, 303)
  }
  const next = safeNext(form?.get('next'), type)

  const supabase = await createServerClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    console.warn(`[auth/confirm] verifyOtp ${type} failed: ${error.message}`)
    return NextResponse.redirect(`${origin}/auth/confirm?error=expired&type=${type}`, 303)
  }
  return NextResponse.redirect(`${origin}${next}`, 303)
}
