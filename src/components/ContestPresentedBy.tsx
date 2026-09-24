import { safeHttpUrl } from '@/lib/tattoo-battle'
import type { ContestSponsor } from '@/lib/after-parties-data'

/**
 * "The {Contest} is presented by {Sponsor}" with logo and website link.
 * Renders nothing when the contest has no sponsor. The sponsor arrives via
 * sponsors_public (confirmed only), and only name, logo and website exist on
 * the type: tier, payment and exclusivity cannot reach this component.
 */
export default function ContestPresentedBy({ contestName, sponsor, className = '' }: {
  contestName: string
  sponsor: ContestSponsor | null | undefined
  className?: string
}) {
  if (!sponsor) return null
  const site = safeHttpUrl(sponsor.website)
  const inner = (
    <>
      {sponsor.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sponsor.logo_url} alt={sponsor.sponsor_name} className="h-10 w-auto object-contain" loading="lazy" />
      )}
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#C4A882' }}>
        The {contestName} is presented by <span className="text-white">{sponsor.sponsor_name}</span>
      </span>
    </>
  )
  return (
    <p className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
      {site ? (
        <a href={site} target="_blank" rel="noopener noreferrer sponsored" className="flex flex-wrap items-center justify-center gap-3">
          {inner}
        </a>
      ) : inner}
    </p>
  )
}
