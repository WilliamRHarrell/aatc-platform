'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ROUTES } from '@/lib/routes'

interface DropdownConfig {
  label: string
  prefix: string
  links: { href: string; label: string }[]
}

// Destinations come from lib/routes.ts (shared with the footer); labels,
// grouping and order are the header's own.
const NAV_LINKS = [
  { href: ROUTES.home, label: 'Home' },
  { href: ROUTES.vote, label: 'Vote' },
]

const DROPDOWNS: DropdownConfig[] = [
  {
    label: 'Buy Tickets',
    prefix: ROUTES.tickets,
    links: [
      { href: ROUTES.tickets, label: 'All Tickets' },
      { href: `${ROUTES.tickets}#friday`, label: 'Friday Pass' },
      { href: `${ROUTES.tickets}#saturday`, label: 'Saturday Pass' },
      { href: `${ROUTES.tickets}#sunday`, label: 'Sunday Pass' },
      { href: `${ROUTES.tickets}#weekend`, label: 'Weekend Pass' },
      { href: `${ROUTES.tickets}#vip`, label: 'VIP Pass' },
    ],
  },
  {
    label: 'Events',
    prefix: '/events',
    links: [
      { href: ROUTES.schedule, label: 'Event Schedule' },
      { href: ROUTES.tattooBattle, label: 'Tattoo Battle' },
      { href: ROUTES.tattooContests, label: 'Tattoo Contests' },
      { href: ROUTES.kidsContest, label: 'Kids Temp Tattoo Contest' },
      { href: ROUTES.panels, label: 'Tattoo Panels' },
      { href: ROUTES.pinupContest, label: 'Miss AATC Pinup Contest' },
      { href: ROUTES.foodTruckRodeo, label: 'Food Truck Rodeo' },
      { href: ROUTES.datingGame, label: 'Tattoo Dating Game' },
      { href: ROUTES.strongestSideshow, label: 'Strongest at the Sideshow' },
      { href: ROUTES.medievalCombat, label: 'Medieval Armored Combat' },
      { href: ROUTES.afterParties, label: 'After Parties' },
      { href: ROUTES.vipMeetGreet, label: 'Gold Star VIP Meet & Greet' },
    ],
  },
  {
    label: 'Event Info',
    prefix: '/info',
    links: [
      { href: ROUTES.about, label: 'About AATC' },
      { href: ROUTES.directions, label: 'Directions' },
      { href: ROUTES.staying, label: 'Staying with AATC' },
      { href: ROUTES.policies, label: 'Convention Policies' },
      { href: ROUTES.wallOfHonor, label: 'Wall of Honor' },
    ],
  },
  {
    label: 'Artists & Vendors',
    prefix: ROUTES.directory,
    links: [
      { href: ROUTES.directory, label: 'Artist & Vendor Directory' },
      { href: ROUTES.findArtist, label: 'Find An Artist' },
      { href: ROUTES.apply, label: 'Booth Applications' },
    ],
  },
  {
    label: 'Sponsors',
    prefix: ROUTES.sponsors,
    links: [
      { href: ROUTES.sponsors, label: 'Sponsor Directory' },
      { href: ROUTES.sponsorPackages, label: 'Sponsorship Packages' },
    ],
  },
]

/** The booth-application pages. /apply/sponsor is under /apply but belongs to Sponsors. */
const BOOTH_APPLY_PATHS: string[] = [ROUTES.apply, '/apply/artist', '/apply/vendor']

function linkActive(href: string, pathname: string): boolean {
  if (href === ROUTES.home) return pathname === ROUTES.home
  if (href === ROUTES.apply) return BOOTH_APPLY_PATHS.includes(pathname)
  return pathname === href || pathname.startsWith(href + '/')
}

function groupActive(config: DropdownConfig, pathname: string): boolean {
  return (
    config.links.some(l => linkActive(l.href, pathname)) ||
    pathname.startsWith(config.prefix) ||
    (config.label === 'Sponsors' && pathname === ROUTES.sponsorApply)
  )
}

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

  const isActive = (href: string) => linkActive(href, pathname)
  const active = groupActive(config, pathname)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
        style={{
          color: active ? '#C4A882' : '#8a8a8a',
          backgroundColor: active ? 'rgba(139,115,85,0.1)' : 'transparent',
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

function MyAatcLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href={ROUTES.portal}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${className}`}
      style={{
        backgroundColor: 'rgba(139,115,85,0.15)',
        color: '#C4A882',
        border: '1px solid rgba(139,115,85,0.3)',
      }}
    >
      My AATC
    </Link>
  )
}

/**
 * Below md (768px) the full row does not fit (it is about 620px wide, and it
 * pushed every phone page into sideways scrolling with half the menu off
 * screen). Phones get the wordmark, My AATC and a menu toggle; the menu is a
 * full-width panel with each dropdown as an expandable group.
 */
function MobileMenu({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  // The group holding the current page starts expanded.
  const [expanded, setExpanded] = useState<string | null>(
    () => DROPDOWNS.find(d => groupActive(d, pathname))?.label ?? null
  )

  const linkStyle = (href: string) => ({
    color: linkActive(href, pathname) ? '#C4A882' : '#cfcfcf',
    backgroundColor: linkActive(href, pathname) ? 'rgba(139,115,85,0.1)' : 'transparent',
  })

  return (
    <div
      id="mobile-nav"
      className="max-h-[calc(100dvh-3rem)] overflow-y-auto border-t pb-4 md:hidden"
      style={{ borderColor: '#1e1e1e' }}
    >
      <ul className="pt-2">
        {NAV_LINKS.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={linkActive(link.href, pathname) ? 'page' : undefined}
              className="block rounded-lg px-3 py-3 text-sm font-semibold"
              style={linkStyle(link.href)}
            >
              {link.label}
            </Link>
          </li>
        ))}
        {DROPDOWNS.map(config => {
          const open = expanded === config.label
          const panelId = `mobile-nav-${config.prefix.replace(/\W+/g, '-')}`
          return (
            <li key={config.label}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : config.label)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold"
                style={{ color: groupActive(config, pathname) ? '#C4A882' : '#cfcfcf' }}
              >
                {config.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="transition-transform"
                  style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open && (
                <ul id={panelId} className="mb-2 ml-3 border-l" style={{ borderColor: '#2a2a2a' }}>
                  {config.links.map(link => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onNavigate}
                        aria-current={linkActive(link.href, pathname) ? 'page' : undefined}
                        className="block px-4 py-2.5 text-sm"
                        style={linkStyle(link.href)}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function PublicNav() {
  const supabase = createClient()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  // The menu remembers the page it was opened on, so a new page closes it.
  // Same-page links (/tickets#friday) close it through onNavigate.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const menuOpen = menuOpenOn === pathname
  const closeMenu = () => setMenuOpenOn(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenOn(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <nav
      className="sticky top-0 z-40 border-b px-4"
      style={{ backgroundColor: '#0a0a0a', borderColor: '#1e1e1e' }}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between">

        {/* Wordmark */}
        <Link
          href={ROUTES.home}
          className="text-sm font-medium uppercase tracking-widest"
          style={{ color: '#C4A882' }}
        >
          #AATC27
        </Link>

        {/* Links (md and up) */}
        <div className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                color: linkActive(link.href, pathname) ? '#C4A882' : '#8a8a8a',
                backgroundColor: linkActive(link.href, pathname) ? 'rgba(139,115,85,0.1)' : 'transparent',
              }}
            >
              {link.label}
            </Link>
          ))}

          {DROPDOWNS.map(config => (
            <NavDropdown key={config.label} config={config} pathname={pathname} />
          ))}

          {authed && <MyAatcLink className="ml-2" />}
        </div>

        {/* Phones: My AATC stays in the bar; everything else is in the menu */}
        <div className="flex items-center gap-2 md:hidden">
          {authed && <MyAatcLink />}
          <button
            type="button"
            onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg"
            style={{ color: menuOpen ? '#C4A882' : '#cfcfcf' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && <MobileMenu pathname={pathname} onNavigate={closeMenu} />}
    </nav>
  )
}
