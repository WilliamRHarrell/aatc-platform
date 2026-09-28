import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ALL_TIERS } from './sponsor-tiers'
import type { PriceVisibility } from './sponsor-prices'

/** Cache tag; the admin toggle purges it (see /api/admin/sponsor-pricing). */
export const PRICE_VISIBILITY_TAG = 'sponsor_tier_settings'

/** Every tier hidden. What a page gets when the setting cannot be read. */
export const ALL_HIDDEN: PriceVisibility = Object.fromEntries(ALL_TIERS.map(t => [t, false])) as PriceVisibility

/**
 * Rows to visibility. FAILS CLOSED: a tier with no row is hidden, so a missing
 * seed or a new tier never publishes a price nobody chose to show. The
 * defaults (packages hidden, items shown) live in the 084 seed, not here.
 */
export function visibilityFromRows(rows: { tier: string; show_price: boolean }[]): PriceVisibility {
  const out = { ...ALL_HIDDEN }
  for (const r of rows) if ((ALL_TIERS as string[]).includes(r.tier)) out[r.tier as keyof PriceVisibility] = r.show_price === true
  return out
}

const cachedRows = unstable_cache(
  async () => {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await supabase.from('sponsor_tier_settings').select('tier, show_price')
    // Throwing keeps a failed read out of the cache; the caller hides all prices.
    if (error) throw new Error(`${error.code}: ${error.message}`)
    return data ?? []
  },
  ['sponsor_tier_settings'],
  { revalidate: 60, tags: [PRICE_VISIBILITY_TAG] },
)

/** Which tiers show their price publicly. On any read failure: none. */
export async function getPriceVisibility(): Promise<PriceVisibility> {
  try {
    return visibilityFromRows(await cachedRows())
  } catch (e) {
    console.error(`[sponsor-price-visibility] read failed, hiding every price: ${String(e)}. If PGRST205 or 42P01, migration 084 is not applied.`)
    return { ...ALL_HIDDEN }
  }
}
