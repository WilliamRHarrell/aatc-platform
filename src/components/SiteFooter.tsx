'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface FeaturedSponsor {
  id: string
  sponsor_name: string
  logo_url: string | null
  website: string | null
}

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/allamericantattooconvention/',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/allamericantattooconvention',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@theaatc',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.2 8.2 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.14z" />
      </svg>
    ),
  },
  {
    label: 'X',
    href: 'https://x.com/officialaatc',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
]

const PLACEHOLDER_IMG = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-assets/skin-reserve-home-2.webp`

export default function SiteFooter() {
  const pathname = usePathname()
  const [sponsors, setSponsors] = useState<FeaturedSponsor[]>([])
  const isAdmin = pathname.startsWith('/admin')

  useEffect(() => {
    if (isAdmin) return
    const supabase = createClient()
    // No join into `invoices` — that subquery triggers the RLS recursion fixed
    // in migration 027, and excluded trade/in-kind sponsors who have no invoice.
    supabase
      .from('sponsorships')
      .select('id, sponsor_name, logo_url, website')
      .eq('featured_footer', true)
      .eq('status', 'confirmed')
      .limit(5)
      .then(({ data, error }) => {
        if (error) {
          console.error(`[footer] sponsor query failed (${error.code}): ${error.message}`)
          return
        }
        if (data) setSponsors(data as FeaturedSponsor[])
      })
  }, [isAdmin])

  // Hide on admin pages (after all hooks have run)
  if (isAdmin) return null

  return (
    <footer className="border-t" style={{ borderColor: '#2a2a2a' }}>
      {/* Social + Contact */}
      <div className="px-4 py-10 text-center">
        <div className="mx-auto max-w-2xl">
          {/* Social icons */}
          <div className="flex items-center justify-center gap-4">
            {SOCIALS.map(({ label, href, icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-all"
                style={{ backgroundColor: '#1a1a1a', color: '#999', border: '1px solid #2a2a2a' }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.backgroundColor = 'rgba(139,115,85,0.2)'
                  el.style.color = '#C4A882'
                  el.style.borderColor = 'rgba(139,115,85,0.4)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.backgroundColor = '#1a1a1a'
                  el.style.color = '#999'
                  el.style.borderColor = '#2a2a2a'
                }}
              >
                {icon}
              </a>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-4 flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-4">
            <a
              href="tel:910-850-2566"
              className="inline-flex items-center gap-2 text-sm transition-colors"
              style={{ color: '#999' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              (910) 850-2566
            </a>
            <span className="hidden h-3 w-px sm:block" style={{ backgroundColor: '#2a2a2a' }} />
            <a
              href="mailto:allamericantattooconvention@gmail.com"
              className="inline-flex items-center gap-2 text-sm transition-colors"
              style={{ color: '#999' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#C4A882')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#999')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              allamericantattooconvention@gmail.com
            </a>
          </div>
        </div>
      </div>

      {/* Sponsor logos — real sponsors only.
          Previously this fell back to five copies of the same placeholder webp
          with alt="Sponsor 1".."Sponsor 5" on EVERY page, which read as five
          real sponsors to anyone glancing at it (and to a crawler). The whole
          block is now hidden when there is nothing to show. */}
      {sponsors.length > 0 && (
        <div className="border-t px-4 py-10" style={{ borderColor: '#2a2a2a' }}>
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#999' }}>
              AATC 2027
            </p>
            <p
              className="font-display mx-auto mt-1 max-w-xl text-base font-bold sm:text-lg"
              style={{ color: '#C4A882' }}
            >
              Thank you to our sponsors for helping make this happen for Fayetteville &amp; Ft Bragg NC!
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
              {sponsors.map(s => {
                const img = (
                  <img
                    src={s.logo_url || PLACEHOLDER_IMG}
                    alt={s.sponsor_name}
                    title={s.sponsor_name}
                    className="h-14 w-auto opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0 sm:h-20"
                  />
                )
                return s.website ? (
                  <a
                    key={s.id}
                    href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                    target="_blank"
                    /* paid placement — see Google's link guidelines */
                    rel="noopener sponsored"
                  >
                    {img}
                  </a>
                ) : (
                  <span key={s.id}>{img}</span>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </footer>
  )
}
