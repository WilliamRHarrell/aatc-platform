import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServerClient } from '@/lib/supabase-server'
import { isAdminRole } from '@/lib/roles'

/**
 * Admin-only cache purge.
 *
 * The public pages are statically prerendered with a 60s revalidate window, so
 * an admin edit would otherwise take up to a minute - and, on a fresh deploy
 * with no traffic, could sit stale much longer. Admin screens call this after a
 * save so the change is visible immediately rather than "eventually".
 *
 * Auth: session cookie must belong to a profile with an admin-family role
 * (admin, content_editor, sponsorship_manager - see src/lib/roles.ts). Editors
 * save page content and Tattoo Battle entries and expect the page to update
 * now, not in 60s; a cache purge is the least privileged thing they do.
 * Deliberately not a shared-secret endpoint - this runs from the browser.
 */
const ALLOWED_PATHS = new Set(['/', '/apply', '/tickets', '/contests', '/sponsors', '/tattoo-battle'])
// Entry pages are dynamic: /tattoo-battle/entry/<n>. Pattern-matched so an
// admin publish can purge exactly the bucket it touched.
const ALLOWED_PATH_PATTERNS = [/^\/tattoo-battle\/entry\/[1-9]\d{0,2}$/]
const ALLOWED_TAGS = new Set(['page_content', 'sponsors', 'panels', 'contests', 'tattoo-battle'])

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

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let body: { paths?: string[]; tags?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    // No body - fall through to defaults below.
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths : ['/']
  const rawTags = Array.isArray(body.tags) ? body.tags : []
  const paths = rawPaths.filter((p): p is string => typeof p === 'string' && (ALLOWED_PATHS.has(p) || ALLOWED_PATH_PATTERNS.some(re => re.test(p))))
  const tags = rawTags.filter((t): t is string => typeof t === 'string' && ALLOWED_TAGS.has(t))

  paths.forEach(p => revalidatePath(p))
  // Next.js 16 requires a cache-life profile; expire: 0 purges immediately.
  // Needed as well as revalidatePath - the pages read through unstable_cache,
  // which revalidatePath alone would leave serving stale data for up to 60s.
  tags.forEach(t => revalidateTag(t, { expire: 0 }))

  return NextResponse.json({ revalidated: { paths, tags } })
}
