import type { Metadata } from 'next'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'

// The page is a client component, which cannot export metadata; its title,
// description, canonical and social preview live here (2026-10-09).
export const metadata: Metadata = pageMetadata('/directory/artists', {
  title: titled('Find an Artist'),
  description: atTheShow('Find a tattoo artist exhibiting'),
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
