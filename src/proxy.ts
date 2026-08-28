import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { canAccess, isAdminRole, landingPath } from '@/lib/roles'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { pathname } = req.nextUrl

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // ── Admin routes ─────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/auth/login', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    // Per-path, not binary. A content_editor reaching /admin/invoices is sent
    // to the first page their role can see rather than bounced off /admin
    // entirely. NOTE: navigation-level only - see src/lib/roles.ts.
    // A signed-in non-admin who reaches /admin belongs in the portal, not on
    // the public apply hub - they already have an account.
    if (!isAdminRole(profile?.role)) {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
    if (!canAccess(profile?.role, pathname)) {
      return NextResponse.redirect(new URL(landingPath(profile?.role), req.url))
    }
  }

  // ── Protected exhibitor routes ────────────────────────────────
  if (pathname.startsWith('/apply/artist') || pathname.startsWith('/apply/vendor') || pathname.startsWith('/portal')) {
    if (!session) {
      const loginUrl = new URL('/auth/login', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── Redirect already-authed users away from auth pages ───────
  // Role-aware, matching the post-login redirect in /auth/login. Costs one
  // profile read, but only on a path a signed-in user reaches by accident.
  if (session && (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    return NextResponse.redirect(new URL(landingPath(profile?.role), req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/apply/artist/:path*',
    '/apply/vendor/:path*',
    '/portal/:path*',
    '/portal',
    '/auth/login',
    '/auth/signup',
  ],
}
