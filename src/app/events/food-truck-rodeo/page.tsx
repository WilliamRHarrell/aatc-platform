'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import PublicNav from '@/components/PublicNav'

interface FoodTruck {
  id: string
  business_name: string
  cuisine_type: string
  logo_url: string | null
  days: string[]
  website: string | null
  instagram: string | null
  facebook: string | null
}

const DAY_LABELS: Record<string, string> = {
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export default function FoodTruckRodeoPage() {
  const [trucks, setTrucks] = useState<FoodTruck[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTrucks() {
      const supabase = createClient()

      const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('is_active', true)
        .single()

      if (!event) { setLoading(false); return }

      const { data } = await supabase
        .from('food_trucks_public')
        .select('id, business_name, cuisine_type, logo_url, days, website, instagram, facebook')
        .eq('event_id', event.id)
        
        .order('business_name')

      if (data) setTrucks(data as FoodTruck[])
      setLoading(false)
    }

    fetchTrucks()
  }, [])

  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Fuel Up Between Sessions</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Food Truck Rodeo</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Step outside the convention hall and discover a lineup of the best food trucks Fayetteville and the surrounding region have to offer. From smoked BBQ to fresh ramen, there is something for every appetite.</span>
        </p>
      </div>

      {/* Hours */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Hours & Location</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>Location</p>
              <p className="mt-2 text-sm font-medium text-white">Outdoor Lot Adjacent to Main Entrance</p>
              <p className="mt-1 text-xs" style={{ color: '#999' }}>Crown Complex Event Center, Fayetteville, NC</p>
            </div>
            <div
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>Hours</p>
              <div className="mt-2 space-y-1">
                <p className="text-xs" style={{ color: '#999' }}>
                  <span className="font-medium text-white">Friday:</span> 11:00 AM - 10:00 PM
                </p>
                <p className="text-xs" style={{ color: '#999' }}>
                  <span className="font-medium text-white">Saturday:</span> 10:00 AM - 10:00 PM
                </p>
                <p className="text-xs" style={{ color: '#999' }}>
                  <span className="font-medium text-white">Sunday:</span> 10:00 AM - 7:00 PM
                </p>
              </div>
              {/* §9.1 - the times above are the rodeo window, not a guarantee
                  every truck is serving. Vendors set their own hours and most
                  pack up earlier than the window suggests. */}
              <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed" style={{ borderColor: '#2a2a2a', color: '#777' }}>
                Truck hours vary - each vendor sets its own. Most trucks will be closed by 9:00 PM.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Food Truck Lineup */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">The Lineup</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Lineup is subject to change. Additional trucks may be announced closer to the event.</span>
          </p>

          {loading ? (
            <div className="flex justify-center py-12">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }}
              />
            </div>
          ) : trucks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg font-semibold text-white"><span className="text-emboss">Food truck lineup coming soon</span></p>
              <p className="mt-2 text-sm" style={{ color: '#999' }}>
                <span className="text-emboss">Check back for announcements as the event approaches.</span>
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trucks.map(truck => (
                <div
                  key={truck.id}
                  className="overflow-hidden rounded-2xl"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  {truck.logo_url && (
                    <div className="h-32 w-full overflow-hidden rounded-t-2xl" style={{ backgroundColor: '#0a0a0a' }}>
                      <img
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/food-truck-logos/${truck.logo_url}`}
                        alt={truck.business_name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    <h3 className="text-sm font-bold text-white">{truck.business_name}</h3>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: '#2a2a2a', color: '#C4A882' }}
                      >
                        {truck.cuisine_type}
                      </span>

                      {truck.days?.map(day => (
                        <span
                          key={day}
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: 'rgba(139,115,85,0.2)', color: '#C4A882' }}
                        >
                          {DAY_LABELS[day] || day}
                        </span>
                      ))}
                    </div>

                    {(truck.instagram || truck.facebook || truck.website) && (
                      <div className="mt-3 flex items-center gap-3">
                        {truck.instagram && (
                          <a
                            href={`https://instagram.com/${truck.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-60 transition-opacity hover:opacity-100"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                            </svg>
                          </a>
                        )}
                        {truck.facebook && (
                          <a
                            href={`https://facebook.com/${truck.facebook.replace(/^\//, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-60 transition-opacity hover:opacity-100"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                            </svg>
                          </a>
                        )}
                        {truck.website && (
                          <a
                            href={truck.website.startsWith('http') ? truck.website : `https://${truck.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-60 transition-opacity hover:opacity-100"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="2" y1="12" x2="22" y2="12" />
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Note */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h3 className="mb-2 text-sm font-bold text-white">Good to Know</h3>
            <ul className="space-y-2">
              {[
                'The food truck rodeo is open to everyone, no convention admission required.',
                'Most trucks accept cash and card. An ATM is available inside the venue.',
                'Re-entry to the convention is permitted with your wristband.',
                'The Crown Complex is a Pepsi venue. Coca-Cola products purchased outside cannot be brought back into the convention center.',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Interested in being a food vendor?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Contact us at{' '}
          <a href="mailto:info@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            info@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
