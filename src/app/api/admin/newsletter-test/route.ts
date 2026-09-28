import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { normaliseEmail, readContactTags, subscribeToNewsletter, NEWSLETTER_TAG } from '@/lib/ghl'

/**
 * GET /api/admin/newsletter-test?email=you%2Btest@example.com[&version=v3]
 *
 * ADMIN ONLY. Runs a real newsletter signup against GoHighLevel through the
 * same code as the footer form (lib/ghl.ts), then reads the contact back and
 * reports its tags. Open it in the browser while signed in as an admin.
 *
 * - Encode "+" in the address as %2B, or it arrives as a space.
 * - `version` overrides the Version header for this run only, to compare
 *   GHL API versions without a deploy.
 * - The read-back needs `contacts.readonly` on the token. Without it the
 *   report says so, and the add-tags response (existing contacts) is the only
 *   evidence of the tags.
 *
 * It creates or updates a real contact: use a test address.
 */
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const url = new URL(req.url)
  const email = normaliseEmail(url.searchParams.get('email'))
  if (!email) return NextResponse.json({ error: 'Pass ?email= (encode + as %2B)' }, { status: 400 })
  const version = url.searchParams.get('version') ?? undefined

  const result = await subscribeToNewsletter(email, { version })
  if (!result.ok) return NextResponse.json({ email, version: version ?? 'default', result }, { status: result.reason === 'not_configured' ? 503 : 502 })

  const read = await readContactTags(result.contactId, { version })
  const readBack = read.tags
    ? { tags: read.tags, hasNewsletterTag: read.tags.includes(NEWSLETTER_TAG) }
    : { tags: null, note: read.step && (read.step.status === 401 || read.step.status === 403)
        ? 'Could not read the contact back: the token needs the contacts.readonly scope.'
        : 'Could not read the contact back.', step: read.step }

  return NextResponse.json({
    email,
    version: version ?? 'default',
    contactId: result.contactId,
    created: result.created,
    tagged: result.tagged,
    tagError: result.tagError ?? null,
    steps: result.steps,
    readBack,
  })
}
