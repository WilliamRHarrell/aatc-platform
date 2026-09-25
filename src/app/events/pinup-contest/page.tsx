import PageImage from '@/components/PageImage'
import PinupContestClient from './PinupContestClient'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

// The pinup cap (events.pinup_capacity, migration 074) read server-side with a
// cookieless anon client, cached 60 s under the 'pinup' tag; /admin/events
// purges it on save. Null when the column is not there yet: the copy then
// says "limited" rather than a number.
const getPinupCapacity = unstable_cache(
  async (): Promise<number | null> => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await sb.from('events').select('pinup_capacity').eq('is_active', true).maybeSingle()
    if (error) return null
    const v = (data as { pinup_capacity?: unknown } | null)?.pinup_capacity
    return typeof v === 'number' ? v : null
  },
  ['pinup-capacity'],
  { revalidate: 60, tags: ['pinup'] },
)

// Server shell. The page body stays a client component for its form state, so
// the image slot is rendered here and passed down as a prop - a server
// component cannot be nested inside a client one, and client-fetching it would
// inject the image after hydration, which is the pattern FooterSponsors was
// moved off for SEO reasons.
//
// PageImage renders nothing at all until an admin uploads to the 'pinup-entry'
// slot, so this is invisible today rather than an empty box above the entry form.
export default async function Page() {
  const capacity = await getPinupCapacity()
  return <PinupContestClient capacity={capacity} entrySlot={<PageImage slug="pinup-entry" className="my-6" />} />
}
