import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WOH_PHOTO_MAX_COUNT, WOH_SUBMISSIONS_BUCKET } from '@/lib/wall-of-honor-submission'
import type { Database } from '@/types/database'

// POST /api/wall-of-honor-submit/files - after the form's uploads, record on
// the entry what actually arrived in its folder (see ../route.ts).
//
// body: { id }. No secret is needed: this only copies the entry folder's real
// contents onto the row, and only for a PENDING entry made in the last day,
// and only fills photo_paths while it is still empty. Calling it for someone
// else's entry changes nothing they did not upload themselves. The private
// bucket enforces type and size on the upload itself (104: 10 MB JPG/PNG/WebP).
// Nothing is returned but a count. Covered by the same WAF rule as ../route.ts.

const WINDOW_MS = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: entry } = await supabase.from('wall_of_honor_entries')
    .select('id, status, submitted_at, photo_paths').eq('id', id).single()
  if (!entry || entry.status !== 'pending' || !entry.submitted_at
      || Date.now() - new Date(entry.submitted_at).getTime() > WINDOW_MS || entry.photo_paths.length > 0) {
    return NextResponse.json({ error: 'Nothing to record for that tribute' }, { status: 409 })
  }

  const listed = await supabase.storage.from(WOH_SUBMISSIONS_BUCKET).list(id, { limit: 100 })
  if (listed.error) {
    console.error(`[wall-of-honor-submit/files] ${id}: list failed: ${listed.error.message}`)
    return NextResponse.json({ error: 'Could not check the uploads' }, { status: 500 })
  }
  // Folders come back as entries with no id; only the form's photo-N files count.
  const photos = (listed.data ?? []).filter(o => o.id && o.name.startsWith('photo-'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, WOH_PHOTO_MAX_COUNT).map(o => `${id}/${o.name}`)

  // Only while still empty: what is already recorded is never overwritten here.
  if (photos.length > 0) {
    const { error } = await supabase.from('wall_of_honor_entries').update({ photo_paths: photos }).eq('id', id)
    if (error) {
      console.error(`[wall-of-honor-submit/files] ${id}: update failed: ${error.message}`)
      return NextResponse.json({ error: 'Could not record the uploads' }, { status: 500 })
    }
  }
  return NextResponse.json({ photos: photos.length })
}
