import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getContent } from '@/content/getContent'
import { CONTACT_EMAIL } from '@/lib/event-config'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import FoodTruckApplyClient from './FoodTruckApplyClient'

export const metadata: Metadata = {
  title: 'Food Truck Application | All American Tattoo Convention 2027',
  description: 'Apply to bring your food truck to the Food Truck Rodeo at the All American Tattoo Convention 2027 in Fayetteville, NC.',
}

// The switch (events.food_truck_applications_open, 091) read server-side with
// a cookieless anon client, cached 60 s under the 'food-trucks' tag;
// /admin/food-trucks purges it on save. Closed when it cannot be read: the
// route refuses a closed submission anyway.
const getApplicationsOpen = unstable_cache(
  async (): Promise<boolean> => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await sb.from('events').select('food_truck_applications_open').eq('is_active', true).maybeSingle()
    if (error) return false
    return (data as { food_truck_applications_open?: unknown } | null)?.food_truck_applications_open === true
  },
  ['food-truck-applications-open'],
  { revalidate: 60, tags: ['food-trucks'] },
)

// Copy is the content editor's ('foodTruckApply'), rendered here so it lands
// in the server HTML (Markdown is a server component). The requirements list
// is code: it carries the deposit and the due date (food-truck-submission.ts).
export default async function FoodTruckApplicationPage() {
  const [open, c] = await Promise.all([getApplicationsOpen(), getContent('foodTruckApply')])

  if (!open) {
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="mb-4 text-2xl font-bold text-white"><span className="text-emboss">{c.closed_title}</span></h1>
          <div className="text-sm leading-relaxed" style={{ color: '#999' }}>
            <Markdown>{c.closed_body}</Markdown>
          </div>
          <p className="mt-4 text-sm">
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#C4A882' }}>{CONTACT_EMAIL}</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <FoodTruckApplyClient
      title={c.title}
      ackLabel={c.ack_label}
      intro={<Markdown>{c.intro}</Markdown>}
    />
  )
}
