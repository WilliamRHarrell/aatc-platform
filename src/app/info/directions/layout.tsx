import type { Metadata } from 'next'
import { pageMetadata, titled } from '@/lib/page-meta'
import { VENUE_NAME, VENUE_STREET, VENUE_CITY, EVENT_NAME, EVENT_YEAR, EVENT_DATES_LABEL } from '@/lib/event-config'

// The page is a client component, which cannot export metadata; its title,
// description, canonical and social preview live here (2026-10-09).
export const metadata: Metadata = pageMetadata('/info/directions', {
  title: titled('Directions'),
  description: `Directions to the ${VENUE_NAME}, ${VENUE_STREET}, ${VENUE_CITY}, NC, for the ${EVENT_NAME} ${EVENT_YEAR}, ${EVENT_DATES_LABEL}.`,
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
