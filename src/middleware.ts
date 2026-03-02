import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })
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

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/apply', req.url))
    }
  }

  // ── Protected exhibitor routes ────────────────────────────────
  if (pathname.startsWith('/apply/artist') || pathname.startsWith('/apply/vendor')) {
    if (!session) {
      const loginUrl = new URL('/auth/login', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── Redirect already-authed users away from auth pages ───────
  if (session && (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup'))) {
    return NextResponse.redirect(new URL('/apply', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/apply/artist/:path*',
    '/apply/vendor/:path*',
    '/auth/login',
    '/auth/signup',
  ],
}
