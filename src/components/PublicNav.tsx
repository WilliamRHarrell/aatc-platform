'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface DropdownConfig {
  label: string
  prefix: string
  links: { href: string; label: string }[]
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/contests', label: 'Vote' },
]

const DROPDOWNS: DropdownConfig[] = [
  {
    label: 'Buy Tickets',
    prefix: '/tickets',
    links: [
      { href: '/tickets', label: 'All Tickets' },
      { href: '/tickets#friday', label: 'Friday Pass' },
      { href: '/tickets#saturday', label: 'Saturday Pass' },
      { href: '/tickets#sunday', label: 'Sunday Pass' },
      { href: '/tickets#weekend', label: 'Weekend Pass' },
      { href: '/tickets#vip', label: 'VIP Pass' },
    ],
  },
  {
    label: 'Events',
    prefix: '/events',
    links: [
      { href: '/events/tattoo-contests', label: 'Tattoo Contests' },
      { href: '/events/tattoo-panels', label: 'Tattoo Panels' },
      { href: '/events/schedule', label: 'Event Schedule' },
      { href: '/events/pinup-contest', label: 'Miss AATC Pinup Contest' },
      { href: '/events/food-truck-rodeo', label: 'Food Truck Rodeo' },
      { href: '/events/dating-game', label: 'Tattoo Dating Game' },
      { href: '/events/strongest-sideshow', label: 'Strongest at the Sideshow' },
      { href: '/events/medieval-combat', label: 'Medieval Armored Combat' },
      { href: '/events/after-parties', label: 'After Parties' },
      { href: '/events/vip-meet-greet', label: 'Gold Star VIP Meet & Greet' },
    ],
  },
  {
    label: 'Event Info',
    prefix: '/info',
    links: [
      { href: '/info/about', label: 'About AATC' },
      { href: '/info/directions', label: 'Directions' },
      { href: '/info/staying', label: 'Staying with AATC' },
      { href: '/info/policies', label: 'Convention Policies' },
      { href: '/info/wall-of-honor', label: 'Wall of Honor' },
    ],
  },
  {
    label: 'Artists & Vendors',
    prefix: '/directory',
    links: [
      { href: '/directory', label: 'Artist & Vendor Directory' },
      { href: '/directory/artists', label: 'Find An Artist' },
      { href: '/apply/artist', label: 'Booth Applications' },
    ],
  },
  {
    label: 'Sponsors',
    prefix: '/sponsors',
    links: [
      { href: '/sponsors', label: 'Sponsor Directory' },
      { href: '/sponsors/packages', label: 'Become A Sponsor' },
    ],
  },
]

function NavDropdown({ config, pathname }: { config: DropdownConfig; pathname: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const groupActive =
    config.links.some(l => isActive(l.href)) ||
    pathname.startsWith(config.prefix) ||
    (config.label === 'Artists & Vendors' && (pathname === '/apply/artist' || pathname === '/apply/vendor'))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
        style={{
          color: groupActive ? '#C4A882' : '#666',
          backgroundColor: groupActive ? 'rgba(139,115,85,0.1)' : 'transparent',
        }}
      >
        {config.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-xl py-1 shadow-xl"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
        >
          {config.links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-xs font-semibold transition-colors"
              style={{
                color: isActive(link.href) ? '#C4A882' : '#999',
                backgroundColor: isActive(link.href) ? 'rgba(139,115,85,0.1)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!isActive(link.href)) {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)'
                  ;(e.currentTarget as HTMLElement).style.color = '#fff'
                }
              }}
              onMouseLeave={e => {
                if (!isActive(link.href)) {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = '#999'
                }
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PublicNav() {
  const supabase = createClient()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
  }, [])

  // '/' must be an exact match - the startsWith branch would otherwise mark it
  // active on every page. Same reason the old '/apply' entry was special-cased.
  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className="sticky top-0 z-40 border-b px-4"
      style={{ backgroundColor: '#0a0a0a', borderColor: '#1e1e1e' }}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between">

        {/* Wordmark */}
        <Link
          href="/"
          className="text-sm font-medium uppercase tracking-widest"
          style={{ color: '#C4A882' }}
        >
          #AATC27
        </Link>

        {/* Links */}
        <div className="flex items-center gap-0.5">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                color: isActive(link.href) ? '#C4A882' : '#666',
                backgroundColor: isActive(link.href) ? 'rgba(139,115,85,0.1)' : 'transparent',
              }}
            >
              {link.label}
            </Link>
          ))}

          {DROPDOWNS.map(config => (
            <NavDropdown key={config.label} config={config} pathname={pathname} />
          ))}

          {authed && (
            <Link
              href="/portal"
              className="ml-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'rgba(139,115,85,0.15)',
                color: '#C4A882',
                border: '1px solid rgba(139,115,85,0.3)',
              }}
            >
              My AATC
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
