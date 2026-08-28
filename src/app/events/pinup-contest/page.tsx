import PageImage from '@/components/PageImage'
import PinupContestClient from './PinupContestClient'

// Server shell. The page body stays a client component for its form state, so
// the image slot is rendered here and passed down as a prop - a server
// component cannot be nested inside a client one, and client-fetching it would
// inject the image after hydration, which is the pattern FooterSponsors was
// moved off for SEO reasons.
//
// PageImage renders nothing at all until an admin uploads to the 'pinup-entry'
// slot, so this is invisible today rather than an empty box above the entry form.
export default function Page() {
  return <PinupContestClient entrySlot={<PageImage slug="pinup-entry" className="my-6" />} />
}
