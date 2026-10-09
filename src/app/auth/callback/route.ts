import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

/**
 * Signup confirmation lands here (signup page: emailRedirectTo /auth/callback).
 *
 * Supabase confirms the address when the emailed link is opened, BEFORE this
 * redirect. The code exchange then needs the PKCE verifier cookie, which only
 * the browser that signed up has. Opened elsewhere (another browser, the Mail
 * app on a phone), the exchange fails but the account IS confirmed: send them
 * to sign in with a sentence, not to /apply signed out with nothing said.
 * A used or expired link arrives with ?error=...: say so (lib/auth-link.ts).
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (searchParams.get('error') || searchParams.get('error_code')) {
    return NextResponse.redirect(`${origin}/auth/login?notice=link_expired`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn(`[auth/callback] code exchange failed (${error.message}); the address is confirmed, sending to sign in`)
      return NextResponse.redirect(`${origin}/auth/login?notice=confirmed`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}

/** Same-site paths only: ?next= must never send someone to another host. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/apply'
}
