import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildSitemap } from '@/lib/sitemap'
import { getPublishedEntries } from '@/lib/tattoo-battle-data'

/**
 * /sitemap.xml - robots.ts points here on the production host. URLs are on the
 * canonical www origin; the list is built in src/lib/sitemap.ts.
 */
export const revalidate = 3600

/** Approved exhibitors: the same filter /directory uses on the public view. */
async function directoryIds(): Promise<string[]> {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await supabase
    .from('applications_public')
    .select('id')
    .eq('status', 'approved')
    .order('id')
  if (error) {
    console.error(`[sitemap] directory query failed (${error.code}): ${error.message}`)
    return []
  }
  return (data ?? []).map(r => r.id).filter((id): id is string => !!id)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [ids, entries] = await Promise.all([directoryIds(), getPublishedEntries()])
  return buildSitemap({ directoryIds: ids, battleBuckets: entries.map(e => e.bucket_number) })
}
