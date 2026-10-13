import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

/**
 * Admin-only: start n8n workflow A ("AATC - Artist Top Posts Refresh").
 * body: { handles?: string[] }  - empty/omitted = every artist in
 * artist_social_handles_v (n8n reads the view with the service key).
 *
 * The workflow runs several minutes and writes metrics/media itself; this
 * route only delivers the trigger, so it waits a few seconds for n8n to
 * acknowledge and then reports "started". The webhook secret lives here and
 * never reaches the client.
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

  const body = (await req.json().catch(() => ({}))) as { handles?: unknown }
  const handles = Array.isArray(body.handles)
    ? body.handles.filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 200)
    : []

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/webhook/aatc-artist-posts-refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aatc-secret': secret },
      body: JSON.stringify(handles.length ? { handles } : {}),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `n8n refused the refresh (${res.status}).` }, { status: 502 })
    }
    return NextResponse.json({ ok: true, started: handles.length || 'all' })
  } catch (e) {
    // A timeout means n8n took the request and is working; only a failed
    // connection is an error worth surfacing.
    if (e instanceof Error && e.name === 'TimeoutError') {
      return NextResponse.json({ ok: true, started: handles.length || 'all' })
    }
    return NextResponse.json({ error: `The refresh did not reach n8n: ${e instanceof Error ? e.message : 'network error'}` }, { status: 502 })
  }
}
