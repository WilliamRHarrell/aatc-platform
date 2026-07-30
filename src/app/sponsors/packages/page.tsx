'use client'

import { useEffect, useState } from 'react'
import { SPONSOR_TIERS, tierPrice, tierDeadline, type SponsorTier } from '@/lib/sponsor-tiers'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'

/**
 * Only the marketing perk copy lives here. name, price, colour, group and the
 * sell limit are derived from lib/sponsor-tiers.ts — this page previously kept
 * its own `price: '$20,000'` strings, which is how it came to advertise Gold at
 * $3,000 against a $5,000 packet.
 */
interface TierPackage {
  tier: SponsorTier
  perks: string[]
}

/** Derived view of a package for rendering. */
function pkgView(p: TierPackage) {
  const def = SPONSOR_TIERS[p.tier]
  return {
    tier: p.tier,
    perks: p.perks,
    name: def.label,
    price: tierPrice(p.tier),
    color: def.color,
    group: def.group,
    limit: def.limit,
    deadline: tierDeadline(p.tier),
  }
}

const PACKAGE_PERKS: TierPackage[] = [
  {
    tier: 'title',
    perks: [
      'Four (4) 10\'x10\' booths at the main entrance',
      'Logo on all social media graphics leading up to the event',
      'Title sponsorship on the "Best In Show" tattoo contest award',
      'Logo on all printed material leading up to and during the event',
      'Banner placement on the main stage for the duration of the event',
      'Logo and information prominently displayed on the website homepage',
      '4 posts monthly on all social media channels promoting your brand',
      'Title sponsor on the cover of the event guide',
      'Full-page ad in the event guide',
      'Featured on the AATC sponsor page',
      'Ten (10) weekend passes',
    ],
  },
  {
    tier: 'platinum',
    perks: [
      'Two (2) 10\'x10\' booths at the entrance',
      'Logo on most printed material including souvenir signature poster',
      'Banner placement in the main entrance',
      'Logo and information on the website and some social media graphics',
      'Multiple posts on all social media channels promoting your brand',
      'Ad in the event guide and sponsor page',
      'Featured on the AATC sponsor page',
      'Five (5) weekend passes',
    ],
  },
  {
    tier: 'gold',
    perks: [
      'Two (2) 10\'x10\' booths',
      'Banner placement in the main entrance',
      'Logo and information on the website',
      'Multiple posts on all social media channels promoting your brand',
      'Ad in the event guide and sponsor page',
      'Featured on the AATC sponsor page',
      'Five (5) weekend passes',
    ],
  },
  {
    tier: 'silver',
    perks: [
      'One (1) 10\'x10\' vendor only booth',
      'Banner placement in the main entrance',
      'One promotional post on all social media channels',
      'Ad in the event guide and sponsor page',
      'Featured on the AATC sponsor page',
      'Three (3) weekend passes',
    ],
  },
  {
    tier: 'brass',
    perks: [
      'Table presence at the entrance (manned or unmanned)',
      'Ad in the event guide and sponsor page',
      'Featured on the AATC sponsor page',
      'Two (2) weekend passes',
    ],
  },
  {
    tier: 'collectible_coin',
    perks: [
      'Your logo on the collectible AATC Challenge coin (one side AATC, one side sponsor)',
      'Coin included in every artist and vendor booth package',
      'Limited to 1,500 coins per year — only one of these sold annually',
    ],
  },
  {
    tier: 'vip_bag',
    perks: [
      'Your logo printed on every VIP bag',
      'Place materials inside every VIP bag',
      'Add your logo, information, or product samples',
      'Option to name the VIP bag pickup table after your company',
    ],
  },
  {
    tier: 'collectors_choice',
    perks: [
      'Your logo on every vote page of our website',
      'Award named after your company',
      '$500 prize to the winning collector, FREE booth for the winning artist next year',
      '30 days of online voting after the show',
      'Option to add your own prize package for the winners',
    ],
  },
  {
    tier: 'artist_lounge',
    perks: [
      'VIP access to the artist lounge for up to 25 guests',
      'The lounge will be named after your company for the event',
      'Exclusive access to the artist area for your VIP guests',
    ],
  },
  {
    tier: 'rafter_banner',
    perks: [
      'Hang a 15\'x25\' banner above your booth or along the wall',
      'Includes banner printing and hanging fee',
      'Continuous visibility all weekend by all convention goers',
    ],
  },
]

const PACKAGES = PACKAGE_PERKS.map(pkgView)

export default function SponsorPackagesPage() {
  const supabase = createClient()
  const [soldTiers, setSoldTiers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }

      // Which limited tiers are already taken. Goes through an RPC rather than
      // selecting sponsorships directly: pending rows are no longer publicly
      // readable (migration 027), and this needs pending + confirmed counts to
      // avoid re-listing a tier that is already spoken for. The function
      // returns aggregates only — no names, emails or amounts.
      const { data: counts, error: countErr } = await supabase
        .rpc('sponsor_tier_counts', { p_event_id: event.id })

      if (countErr) {
        console.error(
          `[packages] sponsor_tier_counts failed (${countErr.code}): ${countErr.message} — ` +
          'sold-out tiers will render as available. If 42883, migration 027 has not been applied.'
        )
      }

      const tierCounts: Record<string, number> = {}
      for (const row of (counts ?? []) as { tier: string; taken: number }[]) {
        tierCounts[row.tier] = Number(row.taken)
      }

      const sold = new Set<string>()
      for (const pkg of PACKAGES) {
        if (pkg.limit && (tierCounts[pkg.tier] ?? 0) >= pkg.limit) {
          sold.add(pkg.tier)
        }
      }
      setSoldTiers(sold)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Partner With Us</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Become a Sponsor</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Get your brand in front of thousands of tattoo enthusiasts, artists, and military
          supporters. Choose the sponsorship level that fits your goals.</span>
        </p>
      </div>

      <div className="px-4 py-12">
        <div className="mx-auto max-w-5xl">

          {/* Main Tier Packages */}
          <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Sponsorship Tiers</span>
          </h3>
          <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PACKAGES.filter(p => p.group === 'main').map(pkg => {
              const isSold = soldTiers.has(pkg.tier)
              return (
                <div
                  key={pkg.name}
                  className="relative rounded-2xl p-5"
                  style={{
                    backgroundColor: '#1a1a1a',
                    border: `1px solid ${pkg.color}30`,
                    opacity: isSold ? 0.5 : 1,
                  }}
                >
                  {isSold && (
                    <div
                      className="absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                      style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >
                      Sold
                    </div>
                  )}
                  <div className="mb-3 flex items-baseline justify-between">
                    <h4 className="font-display text-lg font-bold" style={{ color: pkg.color }}>{pkg.name}</h4>
                    <span className="text-lg font-bold text-white">{pkg.price}</span>
                  </div>
                  {pkg.deadline && (
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8B7355' }}>
                      Commit by {pkg.deadline}
                    </p>
                  )}
                  {pkg.limit && (
                    <p className="mb-2 text-xs font-semibold" style={{ color: '#ef4444' }}>
                      Limited — only {pkg.limit} available
                    </p>
                  )}
                  <ul className="space-y-2">
                    {pkg.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#bbb' }}>
                        <span className="mt-0.5 shrink-0" style={{ color: pkg.color }}>&#10003;</span>
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* Individual Sponsorship Items */}
          <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Individual Sponsorship Items</span>
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PACKAGES.filter(p => p.group === 'individual').map(pkg => {
              const isSold = soldTiers.has(pkg.tier)
              return (
                <div
                  key={pkg.name}
                  className="relative rounded-2xl p-5"
                  style={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    opacity: isSold ? 0.5 : 1,
                  }}
                >
                  {isSold && (
                    <div
                      className="absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                      style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >
                      Sold
                    </div>
                  )}
                  <div className="mb-3 flex items-baseline justify-between">
                    <h4 className="font-display text-sm font-bold text-white">{pkg.name}</h4>
                    <span className="text-sm font-bold" style={{ color: '#C4A882' }}>{pkg.price}</span>
                  </div>
                  {pkg.limit && (
                    <p className="mb-2 text-xs font-semibold" style={{ color: '#ef4444' }}>
                      Limited — only {pkg.limit} available
                    </p>
                  )}
                  <ul className="space-y-2">
                    {pkg.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#bbb' }}>
                        <span className="mt-0.5 shrink-0" style={{ color: '#C4A882' }}>&#10003;</span>
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <p className="mb-4 text-sm" style={{ color: '#999' }}>
              <span className="text-emboss">Interested in sponsoring AATC 2027? Apply now to get started.</span>
            </p>
            <Link
              href="/apply/sponsor"
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#8B7355' }}
            >
              Apply for Sponsorship
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
