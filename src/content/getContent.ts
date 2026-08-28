import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { defaultsFor } from './registry'

/** Cookieless anon client - safe for public reads and cacheable. */
function readClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const cachedRows = unstable_cache(
  async (pageKey: string) => {
    const supabase = readClient()
    const { data } = await supabase
      .from('page_content')
      .select('section_key, content')
      .eq('page_key', pageKey)
    return data ?? []
  },
  ['page_content'],
  { revalidate: 60, tags: ['page_content'] }
)

/**
 * Returns { section_key: value } for a page, DB values merged over registry
 * defaults. Always includes every registry section, so pages never render blank.
 */
export async function getContent(pageKey: string): Promise<Record<string, string>> {
  const merged = defaultsFor(pageKey)
  const rows = await cachedRows(pageKey)
  for (const row of rows) {
    if (row.content != null && row.content !== '') merged[row.section_key] = row.content
  }
  return merged
}
