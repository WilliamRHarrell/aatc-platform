import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getContent } from '@/content/getContent'
import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import WallOfHonorSubmitClient from './WallOfHonorSubmitClient'
import { pageMetadata } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata('/info/wall-of-honor/submit', {
  title: 'Submit a Tribute | Wall of Honor | All American Tattoo Convention 2027',
  description: 'Share a tribute and photos for the Wall of Honor at the All American Tattoo Convention 2027 in Fayetteville, NC.',
})

// The switch (events.wall_of_honor_open, 104) read server-side with a
// cookieless anon client, cached 60 s under the 'wall-of-honor' tag; the admin
// page purges it on save. Closed when it cannot be read: the route refuses a
// closed submission anyway.
const getSubmissionsOpen = unstable_cache(
  async (): Promise<boolean> => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data, error } = await sb.from('events').select('wall_of_honor_open').eq('is_active', true).maybeSingle()
    if (error) return false
    return (data as { wall_of_honor_open?: unknown } | null)?.wall_of_honor_open === true
  },
  ['wall-of-honor-open'],
  { revalidate: 60, tags: ['wall-of-honor'] },
)

// Copy is the content editor's ('wallOfHonorSubmit'), rendered here so it lands
// in the server HTML (Markdown is a server component).
export default async function WallOfHonorSubmitPage() {
  const [open, c] = await Promise.all([getSubmissionsOpen(), getContent('wallOfHonorSubmit')])

  if (!open) {
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="mb-4 text-2xl font-bold text-white"><span className="text-emboss">{c.closed_title}</span></h1>
          <div className="text-sm leading-relaxed" style={{ color: '#999' }}>
            <Markdown>{c.closed_body}</Markdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <WallOfHonorSubmitClient
      title={c.intro_title}
      intro={<Markdown>{c.intro_body}</Markdown>}
      deadlineLine={c.deadline_line}
      reviewNote={c.review_note}
      consentLabel={c.consent_label}
      consentSocialLabel={c.consent_social_label}
      successTitle={c.success_title}
      successBody={<Markdown>{c.success_body}</Markdown>}
    />
  )
}
