import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServerClient } from '@/lib/supabase-server'
import { ALL_TIERS, type SponsorTier } from '@/lib/sponsor-tiers'
import { SPONSOR_PRICES } from '@/lib/sponsor-prices'
import { PRICE_VISIBILITY_TAG, visibilityFromRows } from '@/lib/sponsor-price-visibility'

/**
 * Sponsorship list prices and the per-tier "show price" setting, for
 * /admin/sponsorships.
 *
 * WHY A ROUTE: the admin page is a browser component, and a browser component
 * cannot import lib/sponsor-prices.ts without publishing every price in its
 * JavaScript (static chunks are served to anyone, admin page or not). So the
 * page asks for the prices here, behind the same roles that manage sponsors.
 *
 * GET  -> { prices: {tier: cents}, showPrice: {tier: boolean} }
 * POST { tier, showPrice } -> saves one flag (RLS: admin, sponsorship_manager;
 *      084) and purges /sponsors/packages and /apply/sponsor.
 */
const ROLES = ['admin', 'sponsorship_manager']

async function authorise() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!ROLES.includes(profile?.role ?? '')) return { supabase, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, error: null }
}

export async function GET() {
  const { supabase, error } = await authorise()
  if (error) return error
  // Read fresh (not the public cache), so the toggles show what is saved now.
  const { data, error: readErr } = await supabase.from('sponsor_tier_settings').select('tier, show_price')
  if (readErr) {
    return NextResponse.json({ error: `Could not read price visibility (${readErr.code}). If PGRST205 or 42P01, migration 084 is not applied.` }, { status: 500 })
  }
  return NextResponse.json({ prices: SPONSOR_PRICES, showPrice: visibilityFromRows(data ?? []) })
}

export async function POST(req: Request) {
  const { supabase, error } = await authorise()
  if (error) return error
  const body = (await req.json().catch(() => ({}))) as { tier?: string; showPrice?: unknown }
  if (!body.tier || !(ALL_TIERS as string[]).includes(body.tier) || typeof body.showPrice !== 'boolean') {
    return NextResponse.json({ error: 'tier and showPrice (boolean) are required' }, { status: 400 })
  }
  // .select() so a write RLS filtered to zero rows is an error, not a silent success.
  const { data, error: writeErr } = await supabase
    .from('sponsor_tier_settings')
    .update({ show_price: body.showPrice })
    .eq('tier', body.tier as SponsorTier)
    .select('tier')
  if (writeErr || !data || data.length !== 1) {
    console.error(`[sponsor-pricing] ${body.tier} not saved: ${writeErr?.message ?? `${data?.length ?? 0} rows`}`)
    return NextResponse.json({ error: 'Price visibility not saved' }, { status: 500 })
  }
  revalidateTag(PRICE_VISIBILITY_TAG, { expire: 0 })
  revalidatePath('/sponsors/packages')
  revalidatePath('/apply/sponsor')
  return NextResponse.json({ tier: body.tier, showPrice: body.showPrice })
}
