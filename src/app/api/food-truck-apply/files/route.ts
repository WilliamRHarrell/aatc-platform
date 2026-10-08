import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PHOTO_MAX_COUNT } from '@/lib/food-truck-submission'
import type { Database } from '@/types/database'

// POST /api/food-truck-apply/files - after the form's uploads, record on the
// application what actually arrived in its folder (see ../route.ts).
//
// body: { id }. No secret is needed: this only copies the truck folder's real
// contents onto the row, and only for a PENDING application made in the last
// day whose files are not recorded yet. Calling it for someone else's truck
// changes nothing they did not upload themselves. The bucket enforces type and
// size on the upload itself (091: 10 MB, JPG/PNG/WebP).

const BUCKET = 'food-truck-logos'
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

  const { data: truck } = await supabase.from('food_trucks')
    .select('id, status, applied_at, logo_url, photos').eq('id', id).single()
  if (!truck || truck.status !== 'pending' || !truck.applied_at
      || Date.now() - new Date(truck.applied_at).getTime() > WINDOW_MS
      || truck.logo_url || truck.photos.length > 0) {
    return NextResponse.json({ error: 'Nothing to record for that application' }, { status: 409 })
  }

  const [root, photoDir] = await Promise.all([
    supabase.storage.from(BUCKET).list(id, { limit: 100 }),
    supabase.storage.from(BUCKET).list(`${id}/photos`, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } }),
  ])
  if (root.error || photoDir.error) {
    console.error(`[food-truck-apply/files] ${id}: list failed: ${root.error?.message ?? photoDir.error?.message}`)
    return NextResponse.json({ error: 'Could not check the uploads' }, { status: 500 })
  }
  // Folders come back as entries with no id.
  const logo = (root.data ?? []).find(o => o.id && o.name.startsWith('logo-'))
  const photos = (photoDir.data ?? []).filter(o => o.id).slice(0, PHOTO_MAX_COUNT).map(o => `${id}/photos/${o.name}`)

  const patch = { logo_url: logo ? `${id}/${logo.name}` : null, photos }
  const { error } = await supabase.from('food_trucks').update(patch).eq('id', id)
  if (error) {
    console.error(`[food-truck-apply/files] ${id}: update failed: ${error.message}`)
    return NextResponse.json({ error: 'Could not record the uploads' }, { status: 500 })
  }
  return NextResponse.json({ logo: !!logo, photos: photos.length })
}
