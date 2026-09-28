import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ROUTES } from '@/lib/routes'
import { CONTACT_EMAIL, CONTACT_PHONE, SOCIAL } from '@/lib/event-config'
import NewsletterForm from '@/components/NewsletterForm'

/**
 * Site footer (design handoff: docs/design/site-footer/README.md), rendered by
 * the root layout directly BELOW the sponsor section (FooterSponsors) on every
 * public page. Hidden on /admin by the layout's PublicBottom wrapper.
 *
 * Differences from the handoff, all Ryan's calls (2026-09-28): no flag image
 * (the background is the header's), the site's own icons (no Font Awesome),
 * CONTACT_EMAIL instead of the gmail address, four nav columns of real pages
 * instead of the placeholder three, and a Buy Tickets button in the brand
 * block. Colours are the handoff's antique golds as theme tokens (globals.css).
 *
 * Links go through lib/routes.ts, shared with the header; the grouping and
 * labels below are the footer's own.
 */
const NAV: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Events',
    links: [
      { label: 'Tattoo Battle', href: ROUTES.tattooBattle },
      { label: 'Tattoo Contests', href: ROUTES.tattooContests },
      { label: 'Panels & Seminars', href: ROUTES.panels },
      { label: 'Vote', href: ROUTES.vote },
    ],
  },
  {
    heading: 'Event Info',
    links: [
      { label: 'Event Schedule', href: ROUTES.schedule },
      { label: 'About AATC', href: ROUTES.about },
      { label: 'Venue & Directions', href: ROUTES.directions },
      { label: 'After Parties', href: ROUTES.afterParties },
    ],
  },
  {
    heading: 'Artists & Vendors',
    links: [
      { label: 'Apply for a Booth', href: ROUTES.apply },
      { label: 'Exhibitor Directory', href: ROUTES.directory },
      { label: 'Artist & Vendor Login', href: ROUTES.portalSignIn },
    ],
  },
  {
    heading: 'Sponsors',
    links: [
      { label: 'Become a Sponsor', href: ROUTES.sponsorApply },
      { label: 'Sponsorship Packages', href: ROUTES.sponsorPackages },
      { label: 'Our Sponsors', href: ROUTES.sponsors },
    ],
  },
]

// The site's existing glyphs (moved from the previous footer), at the handoff's 17px.
const SOCIALS: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: 'Instagram',
    href: SOCIAL.instagram,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: SOCIAL.facebook,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: SOCIAL.tiktok,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.2 8.2 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.14z" />
      </svg>
    ),
  },
  {
    label: 'X',
    href: SOCIAL.x,
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
]

const PhoneIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-gold-antique">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)
const MailIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-gold-antique">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)

// Shared class strings (the handoff's type styles).
const heading = 'font-condensed text-[12px] font-semibold uppercase tracking-spread text-gold-antique'
const rule = 'w-6 border-t border-line-gold'
const buttonBase = 'inline-flex items-center justify-center rounded-none border-2 px-7 py-3 font-condensed text-[14px] font-semibold uppercase tracking-caps transition-colors duration-120 ease-out'
const primaryButton = `${buttonBase} border-gold-antique bg-gold-antique text-background hover:border-gold-antique-hover hover:bg-gold-antique-hover active:border-gold-antique-press active:bg-gold-antique-press`
const outlineButton = `${buttonBase} border-gold-antique text-gold-antique hover:border-gold-antique-hover hover:text-gold-antique-hover active:border-gold-antique-press active:text-gold-antique-press`

export default function SiteFooter() {
  const year = new Date().getFullYear()
  const tel = `tel:${CONTACT_PHONE.replace(/\D/g, '')}`

  return (
    <footer className="border-t border-line-gold bg-background font-condensed">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 pb-6 pt-12 min-[600px]:px-12 min-[600px]:pb-8 min-[600px]:pt-16">

        {/* Main band: brand, four nav columns, newsletter. Below 1000px the brand
            and newsletter take full rows and the nav columns share one (2x2
            under 760px, where four caps columns no longer fit); one column
            under 600px. */}
        <div className="grid grid-cols-1 gap-10 min-[600px]:grid-cols-2 min-[760px]:grid-cols-4 min-[1000px]:grid-cols-[minmax(0,1.1fr)_repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
          <div className="flex flex-col items-start gap-4 min-[600px]:col-span-2 min-[760px]:col-span-4 min-[1000px]:col-span-1">
            <Link href={ROUTES.home} className="block w-full max-w-[280px] min-[1000px]:max-w-none">
              <Image
                src="/images/footer/aatc-secondary-logo.png"
                alt="The All American Tattoo Convention"
                width={1271}
                height={479}
                sizes="(min-width: 1000px) 200px, 280px"
                className="block h-auto w-full"
              />
            </Link>
            <p className="text-[12px] uppercase leading-[1.6] tracking-caps text-text-muted">
              Crown Complex<br />Fayetteville / Fort Bragg, NC
            </p>
            {/* Fills the column like the logo: six columns leave the brand block
                too narrow for this label on one line otherwise. */}
            <Link href={ROUTES.tickets} className={`${primaryButton} w-full max-w-[280px] whitespace-nowrap px-4 min-[1000px]:max-w-none`}>Buy Tickets</Link>
          </div>

          {NAV.map(col => (
            <nav key={col.heading} aria-label={col.heading} className="flex min-w-0 flex-col gap-3">
              <p className={heading}>{col.heading}</p>
              <div className={rule} />
              {col.links.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-[14px] uppercase tracking-[0.06em] text-text-body no-underline transition-colors duration-120 ease-out hover:text-gold-antique-hover"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}

          <div className="@container flex min-w-0 flex-col gap-3 min-[600px]:col-span-2 min-[760px]:col-span-4 min-[1000px]:col-span-1">
            <p className={heading}>Newsletter</p>
            <div className={rule} />
            <p className="text-[20px] font-bold uppercase leading-[1.15] tracking-caps text-text-primary">Get the lineup first</p>
            <p className="text-[14px] font-light leading-normal text-text-muted">Artist announcements, contest news and ticket drops.</p>
            <NewsletterForm />
          </div>
        </div>

        {/* Artist & Vendor Login */}
        <div className="flex flex-wrap items-center justify-between gap-6 border border-line-gold bg-surface px-7 py-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-[18px] font-bold uppercase tracking-caps text-text-primary">Artist &amp; Vendor Login</p>
            <p className="text-[14px] font-light text-text-muted">Manage your profile, booth details, and documents year-round.</p>
          </div>
          <a href={ROUTES.portalSignIn} target="_blank" rel="noreferrer" className={outlineButton}>
            Sign In to Your Portal
          </a>
        </div>

        {/* Star divider */}
        <div className="flex items-center gap-4" aria-hidden="true">
          <div className="flex-1 border-t border-line-gold" />
          <span className="text-[12px] tracking-[10px] text-gold-antique">★ ★ ★ ★ ★</span>
          <div className="flex-1 border-t border-line-gold" />
        </div>

        {/* Social, contact, copyright */}
        <div className="flex flex-col items-center gap-5">
          <div className="flex gap-3">
            {SOCIALS.map(s => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                className="inline-flex h-11 w-11 items-center justify-center border border-line-gold text-text-body transition-colors duration-120 ease-out hover:border-gold-antique hover:text-gold-antique-hover"
              >
                {s.icon}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <a href={tel} className="inline-flex items-center gap-2 text-[14px] tracking-[0.04em] text-text-muted no-underline">
              <PhoneIcon />{CONTACT_PHONE}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-[14px] tracking-[0.04em] text-text-muted no-underline">
              <MailIcon />{CONTACT_EMAIL}
            </a>
          </div>
          <p className="text-center text-[11px] uppercase tracking-caps text-text-muted opacity-80">
            © {year} The All American Tattoo Convention · #AATCEAST
          </p>
        </div>
      </div>
    </footer>
  )
}
