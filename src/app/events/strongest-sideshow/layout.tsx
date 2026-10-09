import type { Metadata } from 'next'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'

// The page is a client component, which cannot export metadata; its title,
// description, canonical and social preview live here (2026-10-09).
export const metadata: Metadata = pageMetadata('/events/strongest-sideshow', {
  title: titled('Strongest at the Sideshow'),
  description: atTheShow('Strongest at the Sideshow, the team strongman event,'),
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
