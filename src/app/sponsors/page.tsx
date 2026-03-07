'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'

interface Sponsor {
  id: string
  sponsor_name: string
  tier: string
  logo_url: string | null
  website: string | null
  amount: number
  instagram: string | null
  facebook: string | null
}

const TIER_ORDER = ['title', 'platinum', 'gold', 'silver', 'brass', 'collectible_coin', 'vip_bag', 'collectors_choice', 'artist_lounge', 'rafter_banner']

const TIER_META: Record<string, { label: string; color: string; borderColor: string }> = {
  title:             { label: 'Title Sponsor',         color: '#ffd700', borderColor: 'rgba(255,215,0,0.4)' },
  platinum:          { label: 'Platinum Sponsors',      color: '#e5e4e2', borderColor: 'rgba(229,228,226,0.3)' },
  gold:              { label: 'Gold Sponsors',          color: '#C4A882', borderColor: 'rgba(196,168,130,0.4)' },
  silver:            { label: 'Silver Sponsors',        color: '#a8a8a8', borderColor: 'rgba(168,168,168,0.3)' },
  brass:             { label: 'Brass Sponsors',         color: '#cd7f32', borderColor: 'rgba(205,127,50,0.3)' },
  collectible_coin:  { label: 'Collectible Coin Sponsor', color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  vip_bag:           { label: 'VIP Bag Sponsor',        color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  collectors_choice: { label: "Collector's Choice Sponsor", color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  artist_lounge:     { label: 'Artist Lounge Sponsor',  color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
  rafter_banner:     { label: 'Rafter Banner Sponsor',  color: '#C4A882', borderColor: 'rgba(196,168,130,0.3)' },
}

interface TierPackage {
  name: string
  price: string
  color: string
  perks: string[]
  group: 'main' | 'individual'
}

const PACKAGES: TierPackage[] = [
  {
    name: 'Title Sponsor', price: '$20,000', color: '#ffd700', group: 'main',
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
    name: 'Platinum', price: '$8,000', color: '#e5e4e2', group: 'main',
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
    name: 'Gold', price: '$3,000', color: '#C4A882', group: 'main',
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
    name: 'Silver', price: '$1,000', color: '#a8a8a8', group: 'main',
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
    name: 'Brass', price: '$500', color: '#cd7f32', group: 'main',
    perks: [
      'Table presence at the entrance (manned or unmanned)',
      'Ad in the event guide and sponsor page',
      'Featured on the AATC sponsor page',
      'Two (2) weekend passes',
    ],
  },
  {
    name: 'Collectible Coin Sponsor', price: '$2,500', color: '#C4A882', group: 'individual',
    perks: [
      'Your logo on the collectible AATC Challenge coin (one side AATC, one side sponsor)',
      'Coin included in every artist and vendor booth package',
      'Limited to 1,500 coins per year — only one of these sold annually',
    ],
  },
  {
    name: 'VIP Bag Sponsor', price: '$800', color: '#C4A882', group: 'individual',
    perks: [
      'Place materials inside every VIP bag',
      'Add your logo, information, or product samples',
      'Option to name the VIP bag pickup table after your company',
    ],
  },
  {
    name: "Collector's Choice Sponsor", price: '$1,500', color: '#C4A882', group: 'individual',
    perks: [
      'Your logo on every vote page of our website',
      'Award named after your company',
      '$500 prize to the winning collector, FREE booth for the winning artist next year',
      '30 days of online voting after the show',
      'Option to add your own prize package for the winners',
    ],
  },
  {
    name: 'Artist Lounge Sponsor', price: '$1,000', color: '#C4A882', group: 'individual',
    perks: [
      'VIP access to the artist lounge for up to 25 guests',
      'The lounge will be named after your company for the event',
      'Exclusive access to the artist area for your VIP guests',
    ],
  },
  {
    name: 'Rafter Banner', price: '$750', color: '#C4A882', group: 'individual',
    perks: [
      'Hang a 15\'x25\' banner above your booth or along the wall',
      'Includes banner printing and hanging fee',
      'Continuous visibility all weekend by all convention goers',
    ],
  },
]

export default function SponsorsPage() {
  const supabase = createClient()
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }

      const { data } = await supabase
        .from('sponsorships')
        .select('id, sponsor_name, tier, logo_url, website, amount, instagram, facebook')
        .eq('event_id', event.id)
        .eq('status', 'confirmed')
        .order('amount', { ascending: false })

      setSponsors((data as unknown as Sponsor[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // Group sponsors by tier
  const grouped = TIER_ORDER.reduce<Record<string, Sponsor[]>>((acc, tier) => {
    const tierSponsors = sponsors.filter(s => s.tier === tier)
    if (tierSponsors.length > 0) acc[tier] = tierSponsors
    return acc
  }, {})

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          Support Our Tattooed Military
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          Our Sponsors
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: '#999' }}>
          Thank you to our incredible sponsors who make the Armed &amp; Artistic Tattoo Convention possible.
          Your support directly benefits our tattooed military community.
        </p>
      </div>

      {/* Current Sponsors */}
      {!loading && sponsors.length > 0 && (
        <div className="px-4 py-12">
          <div className="mx-auto max-w-5xl">
            {Object.entries(grouped).map(([tier, tierSponsors]) => {
              const meta = TIER_META[tier] ?? { label: tier, color: '#C4A882', borderColor: '#2a2a2a' }
              const isTitle = tier === 'title'
              return (
                <div key={tier} className="mb-10">
                  <h2 className="mb-5 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: meta.color }}>
                    {meta.label}
                  </h2>
                  <div className={`flex flex-wrap justify-center gap-6 ${isTitle ? '' : ''}`}>
                    {tierSponsors.map(s => (
                      <a
                        key={s.id}
                        href={s.website ?? '#'}
                        target={s.website ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="group flex flex-col items-center transition-transform hover:scale-105"
                      >
                        <div
                          className="flex items-center justify-center overflow-hidden rounded-2xl"
                          style={{
                            width: isTitle ? 200 : tier === 'platinum' ? 160 : 120,
                            height: isTitle ? 200 : tier === 'platinum' ? 160 : 120,
                            backgroundColor: '#111',
                            border: `2px solid ${meta.borderColor}`,
                          }}
                        >
                          {s.logo_url ? (
                            <img src={s.logo_url} alt={s.sponsor_name} className="h-full w-full object-contain p-3" />
                          ) : (
                            <span className="font-display text-3xl font-bold" style={{ color: meta.color }}>
                              {s.sponsor_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-center text-sm font-medium text-white group-hover:underline">
                          {s.sponsor_name}
                        </p>
                        <div className="mt-1 flex items-center justify-center gap-2">
                          {s.instagram && (
                            <a href={`https://instagram.com/${s.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                               className="text-xs hover:underline" style={{ color: '#999' }}
                               onClick={e => e.stopPropagation()}>
                              @{s.instagram.replace(/^@/, '')}
                            </a>
                          )}
                          {s.facebook && (
                            <a href={s.facebook.startsWith('http') ? s.facebook : `https://facebook.com/${s.facebook}`} target="_blank" rel="noopener noreferrer"
                               className="text-xs hover:underline" style={{ color: '#999' }}
                               onClick={e => e.stopPropagation()}>
                              Facebook
                            </a>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Sponsorship Packages */}
      <div className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Become a Sponsor
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm" style={{ color: '#999' }}>
              Partner with us and get your brand in front of thousands of tattoo enthusiasts, artists, and military
              supporters. Choose the sponsorship level that fits your goals.
            </p>
          </div>

          {/* Main Tier Packages */}
          <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#8B7355' }}>
            Sponsorship Tiers
          </h3>
          <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PACKAGES.filter(p => p.group === 'main').map(pkg => (
              <div
                key={pkg.name}
                className="rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: `1px solid ${pkg.color}30` }}
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <h4 className="font-display text-lg font-bold" style={{ color: pkg.color }}>{pkg.name}</h4>
                  <span className="text-lg font-bold text-white">{pkg.price}</span>
                </div>
                <ul className="space-y-2">
                  {pkg.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#bbb' }}>
                      <span className="mt-0.5 shrink-0" style={{ color: pkg.color }}>&#10003;</span>
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Individual Sponsorship Items */}
          <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#8B7355' }}>
            Individual Sponsorship Items
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PACKAGES.filter(p => p.group === 'individual').map(pkg => (
              <div
                key={pkg.name}
                className="rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <h4 className="font-display text-sm font-bold text-white">{pkg.name}</h4>
                  <span className="text-sm font-bold" style={{ color: '#C4A882' }}>{pkg.price}</span>
                </div>
                <ul className="space-y-2">
                  {pkg.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#bbb' }}>
                      <span className="mt-0.5 shrink-0" style={{ color: '#C4A882' }}>&#10003;</span>
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <p className="mb-4 text-sm" style={{ color: '#999' }}>
              Interested in sponsoring AATC 2027? Apply now to get started.
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
