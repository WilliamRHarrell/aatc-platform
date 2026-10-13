import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isStuckSending, validateSend, type SendInput } from '@/lib/artist-posts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Admin-only: send one post to Postiz through n8n workflow B
 * ("AATC - Send Artist Post to Postiz").
 *
 * body: { id, caption, channels, mode: 'draft' | 'schedule',
 *         scheduledLocal?: 'YYYY-MM-DDTHH:mm' (America/New_York), collab }
 *
 * The route sets status = 'sending' (admin RLS update) and hands off; n8n
 * watermarks, uploads, and writes the OUTCOME to the row itself ('sent' +
 * postiz_post_id / sent_at / sent_by / admin_caption, or 'failed' +
 * last_error). Only a call that never reaches n8n is marked 'failed' here.
 * Ingest columns are never written by the app. Secret stays server-side.
 */
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const base = process.env.N8N_BASE_URL
  const secret = process.env.AATC_N8N_SECRET
  if (!base || !secret) return NextResponse.json({ error: 'N8N_BASE_URL / AATC_N8N_SECRET are not configured.' }, { status: 503 })

  const b = (await req.json().catch(() => null)) as Partial<SendInput> | null
  if (!b || typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const input: SendInput = {
    id: b.id,
    caption: typeof b.caption === 'string' ? b.caption : '',
    channels: Array.isArray(b.channels) ? b.channels.filter((c): c is string => typeof c === 'string') : [],
    mode: b.mode === 'schedule' ? 'schedule' : 'draft',
    scheduledLocal: typeof b.scheduledLocal === 'string' ? b.scheduledLocal : undefined,
    collab: b.collab !== false,
    youtubeTitle: typeof b.youtubeTitle === 'string' ? b.youtubeTitle : undefined,
  }
  const v = validateSend(input)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: post } = await supabase.from('artist_social_posts')
    .select('id, handle, status, updated_at').eq('id', input.id).maybeSingle()
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status === 'sending' && !isStuckSending(post.status, post.updated_at)) {
    return NextResponse.json({ error: 'This post is already sending.' }, { status: 409 })
  }

  const { data: marked, error: markErr } = await supabase.from('artist_social_posts')
    .update({ status: 'sending', last_error: null }).eq('id', input.id).select('id')
  if (markErr || !marked?.length) {
    return NextResponse.json({ error: `Could not mark the post as sending: ${markErr?.message ?? 'no row updated'}` }, { status: 500 })
  }

  const fail = async (message: string) => {
    await supabase.from('artist_social_posts')
      .update({ status: 'failed', last_error: message }).eq('id', input.id).select('id')
    return NextResponse.json({ error: message }, { status: 502 })
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/webhook/aatc-artist-post-send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aatc-secret': secret },
      body: JSON.stringify({
        post_id: input.id,
        caption: input.caption,
        channels: input.channels,
        mode: input.mode,
        ...(v.scheduledAtUtc ? { scheduled_at: v.scheduledAtUtc } : {}),
        collab: input.collab,
        ...(v.youtubeTitle ? { youtube_title: v.youtubeTitle } : {}),
        sent_by: user.id,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return await fail(`n8n refused the send (${res.status}).`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    // A timeout means n8n is watermarking and will write the outcome itself;
    // the row stays 'sending' and the 15-minute stuck rule covers a crash.
    if (e instanceof Error && e.name === 'TimeoutError') return NextResponse.json({ ok: true })
    return await fail(`The send did not reach n8n: ${e instanceof Error ? e.message : 'network error'}`)
  }
}
