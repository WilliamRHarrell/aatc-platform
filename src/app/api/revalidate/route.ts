import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServerClient } from '@/lib/supabase-server'

/**
 * Admin-only cache purge.
 *
 * The public pages are statically prerendered with a 60s revalidate window, so
 * an admin edit would otherwise take up to a minute - and, on a fresh deploy
 * with no traffic, could sit stale much longer. Admin screens call this after a
 * save so the change is visible immediately rather than "eventually".
 *
 * Auth: session cookie must belong to a profile with role='admin'. Deliberately
 * not a shared-secret endpoint - this runs from the browser after an admin save.
 */
const ALLOWED_PATHS = new Set(['/', '/apply', '/tickets', '/contests', '/sponsors'])
const ALLOWED_TAGS = new Set(['page_content', 'sponsors', 'panels', 'contests'])

export async function POST(request: Request) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let body: { paths?: string[]; tags?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    // No body - fall through to defaults below.
  }

  const paths = (body.paths ?? ['/']).filter(p => ALLOWED_PATHS.has(p))
  const tags = (body.tags ?? []).filter(t => ALLOWED_TAGS.has(t))

  paths.forEach(p => revalidatePath(p))
  // Next.js 16 requires a cache-life profile; expire: 0 purges immediately.
  // Needed as well as revalidatePath - the pages read through unstable_cache,
  // which revalidatePath alone would leave serving stale data for up to 60s.
  tags.forEach(t => revalidateTag(t, { expire: 0 }))

  return NextResponse.json({ revalidated: { paths, tags } })
}
