import PageImage from '@/components/PageImage'
import TattooContestsClient from './TattooContestsClient'

// Server shell. The page body stays a client component for its form state, so
// the image slot is rendered here and passed down as a prop - a server
// component cannot be nested inside a client one, and client-fetching it would
// inject the image after hydration, which is the pattern FooterSponsors was
// moved off for SEO reasons.
//
// PageImage renders nothing at all until an admin uploads to the 'contest-prizes'
// slot, so this is invisible today rather than an empty box in the prizes section.
export default function Page() {
  return <TattooContestsClient prizesSlot={<PageImage slug="contest-prizes" className="my-6" />} />
}
