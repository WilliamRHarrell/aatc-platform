import type { Metadata } from 'next'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'

// The page is a client component, which cannot export metadata; its title,
// description, canonical and social preview live here (2026-10-09).
export const metadata: Metadata = pageMetadata('/info/staying', {
  title: titled('Staying with AATC'),
  description: atTheShow('Where to stay in Fayetteville for a visit'),
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
