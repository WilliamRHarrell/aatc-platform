/**
 * Gold Star VIP Meet & Greet featured artists, server side (098, 099): the
 * one cached read for /events/vip-meet-greet and the homepage section.
 * Tag 'vip' (and the two paths) are purged by /admin/vip, the booth page and
 * the application editor after a change; otherwise 60 s.
 */
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type VipArtist = Database['public']['Views']['vip_featured_public']['Row']

export { MIN_FEATURED_FOR_HOMEPAGE, VIP_PATHS } from '@/lib/vip-config'

export const getVipArtists = unstable_cache(
  async (): Promise<VipArtist[]> => {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await supabase.from('vip_featured_public').select('*').order('display_order').order('artist_name')
    if (error) { console.error(`[vip] vip_featured_public: ${error.code} ${error.message}`); return [] }
    return data ?? []
  },
  ['vip-featured-artists'],
  { revalidate: 60, tags: ['vip'] },
)
