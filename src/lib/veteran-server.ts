/** Public Veteran badges for server-rendered pages (100): cached, tag 'veteran'. */
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { groupVeteranBadges, type VeteranBadges } from '@/lib/veteran-config'

const getRows = unstable_cache(
  async (): Promise<Array<{ application_id: string; artist_uid: string | null }>> => {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await supabase.from('veteran_badges_public').select('application_id, artist_uid')
    if (error) { console.error(`[veteran] veteran_badges_public: ${error.code} ${error.message}`); return [] }
    return data ?? []
  },
  ['veteran-badges'],
  { revalidate: 60, tags: ['veteran'] },
)

/** Sets do not survive the cache, so the rows are cached and grouped per request. */
export async function getVeteranBadges(): Promise<VeteranBadges> {
  return groupVeteranBadges(await getRows())
}
