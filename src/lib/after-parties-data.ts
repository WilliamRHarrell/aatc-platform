import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { excludeHarnessSponsors } from '@/lib/sponsor-display'
import { isPreConvention, type VenueLite } from '@/lib/venues'

/**
 * After parties are schedule_items rows with kind = 'after_party', read from
 * the PUBLIC view (published rows only) and joined here to `venues`. ANON key,
 * cookieless, cached. A row whose venue was deleted still renders as a night;
 * a row that is unpublished never arrives.
 */
function anon() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export interface AfterParty {
  id: string
  day_date: string
  /** 'HH:MM:SS'. Always present: the public view only carries published rows and a published row must have a time (070). */
  start_time: string
  title: string
  note: string
  venue: VenueLite | null
  preConvention: boolean
}

const VENUE_COLUMNS = 'name, slug, blurb, address, phone, website_url, instagram_url, instagram_label, facebook_url, tiktok_url, logo_slot'

export const getAfterParties = unstable_cache(
  async (): Promise<AfterParty[]> => {
    const supabase = anon()
    const { data: event } = await supabase.from('events').select('id, start_date').eq('is_active', true).maybeSingle()
    if (!event) return []

    const [{ data: rows, error: rowErr }, { data: venues, error: venueErr }] = await Promise.all([
      supabase
        .from('schedule_items_public')
        .select('id, day_date, start_time, title, note, venue_id')
        .eq('event_id', event.id)
        .eq('kind', 'after_party')
        .order('day_date')
        .order('start_time'),
      supabase.from('venues').select(`id, ${VENUE_COLUMNS}`),
    ])
    if (rowErr) {
      // 42703 = migration 070 not applied (no venue_id / kind value). Render nothing, say so.
      console.error(`[after-parties] schedule query failed (${rowErr.code}): ${rowErr.message} - page renders no nights. If 42703/42P01, migration 070 has not been applied.`)
      return []
    }
    if (venueErr) console.error(`[after-parties] venues query failed (${venueErr.code}): ${venueErr.message}`)

    const byId = new Map<string, VenueLite>()
    for (const v of (venues ?? []) as Array<VenueLite & { id: string }>) byId.set(v.id, v)

    return ((rows ?? []) as Array<{ id: string; day_date: string; start_time: string | null; title: string; note: string; venue_id: string | null }>)
      .filter(r => r.start_time !== null)
      .map(r => ({
        id: r.id,
        day_date: r.day_date,
        start_time: r.start_time as string,
        title: r.title,
        note: r.note,
        venue: r.venue_id ? byId.get(r.venue_id) ?? null : null,
        preConvention: isPreConvention(r.day_date, event.start_date),
      }))
  },
  ['after_parties'],
  { revalidate: 60, tags: ['after-parties'] },
)

export interface ContestSponsor {
  sponsor_name: string
  logo_url: string | null
  website: string | null
}

/**
 * Presenting sponsor per contest, for the active event. contests.sponsor_id
 * resolves through sponsors_public, which carries CONFIRMED rows only, so an
 * unconfirmed sponsor never renders. Only name, logo and website are read.
 */
export const getContestSponsors = unstable_cache(
  async (): Promise<Record<string, ContestSponsor>> => {
    const supabase = anon()
    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!event) return {}
    const { data: contests, error } = await supabase
      .from('contests')
      .select('id, sponsor_id')
      .eq('event_id', event.id)
      .not('sponsor_id', 'is', null)
    if (error) {
      console.error(`[contest-sponsors] contests query failed (${error.code}): ${error.message}. If 42703, migration 070 has not been applied.`)
      return {}
    }
    const ids = [...new Set((contests ?? []).map(c => c.sponsor_id).filter((x): x is string => !!x))]
    if (ids.length === 0) return {}
    const { data: sponsors, error: spErr } = await supabase
      .from('sponsors_public')
      .select('id, sponsor_name, logo_url, website')
      .in('id', ids)
    if (spErr) {
      console.error(`[contest-sponsors] sponsors_public query failed (${spErr.code}): ${spErr.message}`)
      return {}
    }
    const clean = excludeHarnessSponsors((sponsors ?? []) as Array<ContestSponsor & { id: string }>)
    const byId = new Map(clean.map(s => [s.id, s]))
    const out: Record<string, ContestSponsor> = {}
    for (const c of contests ?? []) {
      const s = c.sponsor_id ? byId.get(c.sponsor_id) : undefined
      if (s) out[c.id] = { sponsor_name: s.sponsor_name, logo_url: s.logo_url, website: s.website }
    }
    return out
  },
  ['contest_sponsors'],
  { revalidate: 60, tags: ['contests', 'sponsors'] },
)

/**
 * The kids contest row (is_kids_category) and its presenting sponsor, if any.
 * The page itself is static copy; this is the one thing it reads from the
 * contests table. Null sponsor renders nothing (Ryan: kids starts with none).
 */
export const getKidsContestCredit = unstable_cache(
  async (): Promise<{ name: string; sponsor: ContestSponsor | null } | null> => {
    const supabase = anon()
    const { data: event } = await supabase.from('events').select('id').eq('is_active', true).maybeSingle()
    if (!event) return null
    const { data: row, error } = await supabase
      .from('contests')
      .select('id, name')
      .eq('event_id', event.id)
      .eq('is_kids_category', true)
      .limit(1)
      .maybeSingle()
    if (error || !row) return null
    const sponsors = await getContestSponsors()
    return { name: row.name, sponsor: sponsors[row.id] ?? null }
  },
  ['kids_contest_credit'],
  { revalidate: 60, tags: ['contests', 'sponsors'] },
)
