import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MediaItem, ScheduleRowLite } from '@/lib/tattoo-battle'
import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { excludeHarnessSponsors } from '@/lib/sponsor-display'

/**
 * Every public read for the Tattoo Battle. ANON key, cookieless, cached.
 * RLS is what hides drafts: these queries never filter on is_published
 * themselves, so if a policy is ever loosened the page shows it rather than
 * masking it (HANDOFF: check both code AND data; deployed HTML is the authority).
 */
function anon() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export interface BattleEntry {
  id: string
  bucket_number: number
  artist_name: string
  shop_name: string
  city_state: string
  instagram: string
  media: MediaItem[]
  is_champion: boolean
}

const ENTRY_COLUMNS = 'id, bucket_number, artist_name, shop_name, city_state, instagram, media, is_champion'

async function activeEventId(): Promise<string | null> {
  const { data } = await anon().from('events').select('id').eq('is_active', true).maybeSingle()
  return data?.id ?? null
}

export const getPublishedEntries = unstable_cache(
  async (): Promise<BattleEntry[]> => {
    const eventId = await activeEventId()
    if (!eventId) return []
    const { data, error } = await anon()
      .from('tattoo_battle_entries')
      .select(ENTRY_COLUMNS)
      .eq('event_id', eventId)
      .order('bucket_number', { ascending: true })
    if (error) {
      // 42P01 = migration 069 not applied. Degrade to "no entries", but say so.
      console.error(`[tattoo-battle] entries query failed (${error.code}): ${error.message}`)
      return []
    }
    return (data ?? []) as unknown as BattleEntry[]
  },
  ['tattoo_battle_entries'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)

export const getEntryByBucket = unstable_cache(
  async (bucket: number): Promise<BattleEntry | null> => {
    const eventId = await activeEventId()
    if (!eventId) return null
    const { data, error } = await anon()
      .from('tattoo_battle_entries')
      .select(ENTRY_COLUMNS)
      .eq('event_id', eventId)
      .eq('bucket_number', bucket)
      .maybeSingle()
    if (error) {
      console.error(`[tattoo-battle] entry ${bucket} query failed (${error.code}): ${error.message}`)
      return null
    }
    return (data as unknown as BattleEntry | null) ?? null
  },
  ['tattoo_battle_entry'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)

export async function getChampion(): Promise<BattleEntry | null> {
  const entries = await getPublishedEntries()
  return entries.find(e => e.is_champion) ?? null
}

export interface PresenterRow {
  sponsor_name: string
  logo_url: string | null
  website: string | null
  instagram: string | null
}

/**
 * The confirmed sponsorship row for the presenter, matched on the ONE name in
 * event-config. Before the spelling seed runs the row will not match and the
 * page renders the name as text (the documented fallback); nothing borrowed.
 */
export const getPresenter = unstable_cache(
  async (): Promise<PresenterRow | null> => {
    const eventId = await activeEventId()
    if (!eventId) return null
    const { data, error } = await anon()
      .from('sponsors_public')
      .select('sponsor_name, logo_url, website, instagram')
      .eq('event_id', eventId)
      .eq('sponsor_name', TATTOO_BATTLE_PRESENTER)
      .limit(1)
    if (error) {
      console.error(`[tattoo-battle] presenter query failed (${error.code}): ${error.message}`)
      return null
    }
    const rows = excludeHarnessSponsors((data ?? []) as PresenterRow[])
    return rows[0] ?? null
  },
  ['tattoo_battle_presenter'],
  { revalidate: 60, tags: ['sponsors'] },
)

export const getBattleScheduleRows = unstable_cache(
  async (): Promise<ScheduleRowLite[]> => {
    const eventId = await activeEventId()
    if (!eventId) return []
    const { data, error } = await anon()
      .from('schedule_items_public')
      .select('title, day_date, start_time')
      .eq('event_id', eventId)
      .ilike('title', '%battle%')
    if (error) {
      console.error(`[tattoo-battle] schedule query failed (${error.code}): ${error.message}`)
      return []
    }
    return (data ?? []) as ScheduleRowLite[]
  },
  ['tattoo_battle_schedule'],
  { revalidate: 60, tags: ['tattoo-battle'] },
)
