import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { TRUCK_DOC_KINDS, TRUCK_DOCS_BUCKET } from '@/lib/food-truck-submission'

/**
 * Admin-only: short-lived signed URLs for one food truck's health permit and
 * business license (093, private bucket food-truck-docs).
 *
 * Same shape as /api/admin/application-docs: paths come from the TRUCK ROW,
 * never from the request, so a caller cannot sign an arbitrary object. Every
 * call runs as the signed-in admin through the cookie client, so the
 * "food-truck-docs: admin read" storage policy is the authority; the role
 * check here turns a silent empty result into a 403 the page can explain.
 */
const SIGNED_URL_TTL_SECONDS = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { truckId?: unknown }
  const truckId = typeof body.truckId === 'string' && UUID.test(body.truckId) ? body.truckId : null
  if (!truckId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { data: truck } = await supabase.from('food_trucks').select('id, permit_path, license_path').eq('id', truckId).single()
  if (!truck) return NextResponse.json({ error: 'Food truck not found' }, { status: 404 })

  const urls: Record<string, string | null> = {}
  for (const kind of TRUCK_DOC_KINDS) {
    const path = truck[`${kind}_path`]
    if (!path) { urls[kind] = null; continue }
    const { data, error } = await supabase.storage.from(TRUCK_DOCS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (error) console.error(`[admin/food-truck-docs] ${truckId} ${kind}: ${error.message}`)
    urls[kind] = data?.signedUrl ?? null
  }
  return NextResponse.json({ urls, expiresIn: SIGNED_URL_TTL_SECONDS })
}
