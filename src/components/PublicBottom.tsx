'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * The bottom of every public page: the sponsor section, then the site footer
 * (root layout). Neither shows on /admin. A client shell only for the
 * pathname check; its children are server-rendered, so the sponsor logos stay
 * in the server HTML (paid placements - see FooterSponsors).
 */
export default function PublicBottom({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname.startsWith('/admin')) return null
  return <>{children}</>
}
