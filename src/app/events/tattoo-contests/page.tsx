import PageImage from '@/components/PageImage'
import { getContent } from '@/content/getContent'
import { getSchedule } from '@/lib/schedule-data'
import { contestSchedule } from '@/lib/contest-schedule'
import TattooContestsClient from './TattooContestsClient'
import ContestScheduleBlock from './ContestScheduleBlock'

// Server shell. The page body stays a client component for its form state, so
// the image slot is rendered here and passed down as a prop - a server
// component cannot be nested inside a client one, and client-fetching it would
// inject the image after hydration, which is the pattern FooterSponsors was
// moved off for SEO reasons.
//
// PageImage renders nothing at all until an admin uploads to the 'contest-prizes'
// slot, so this is invisible today rather than an empty box in the prizes section.
//
// The Daily Contest Schedule is server-rendered the same way: its copy comes
// from the page-content registry and its times from the schedule rows.
export default async function Page() {
  const [copy, schedule] = await Promise.all([getContent('tattooContests'), getSchedule()])
  return (
    <TattooContestsClient
      prizesSlot={<PageImage slug="contest-prizes" className="my-6" />}
      scheduleSlot={<ContestScheduleBlock schedule={contestSchedule(schedule)} copy={copy} />}
    />
  )
}
