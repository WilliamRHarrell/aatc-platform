import { Globe, Instagram, Facebook, Music2 } from 'lucide-react'
import { getPageImage, pageImageUrl } from '@/components/PageImage'
import { timeLabel } from '@/lib/schedule-format'
import { mapsUrl, nightLabel, venueLinks, type LinkKind } from '@/lib/venues'
import type { AfterParty } from '@/lib/after-parties-data'

const ICON: Record<LinkKind, typeof Globe> = { website: Globe, instagram: Instagram, facebook: Facebook, tiktok: Music2 }

/**
 * One after-party night. Same card and thumbnail treatment as the tattoo
 * panels list: square 144 px (160 px from sm) beside the text. Logos are
 * object-contain with padding on the brand background; photos would be
 * object-cover, but a venue slot holds a logo by definition.
 *
 * A night with no venue renders the night, date, badge and title only. A
 * venue with no address renders no map link. Nothing here says "TBA".
 */
export default async function VenueCard({ party }: { party: AfterParty }) {
  const { night, date } = nightLabel(party.day_date)
  const v = party.venue
  const logo = v?.logo_slot ? await getPageImage(v.logo_slot) : null
  const links = v ? venueLinks(v) : []

  return (
    <article className="flex gap-4 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      {logo?.image_path && logo.alt?.trim() && (
        <div className="h-36 w-36 shrink-0 overflow-hidden rounded-xl p-3 sm:h-40 sm:w-40" style={{ backgroundColor: '#0a0a0a' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pageImageUrl(logo.image_path)} alt={logo.alt} className="h-full w-full object-contain" loading="lazy" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-bold text-white">{night}</h2>
          <span className="text-sm" style={{ color: '#C4A882' }}>{date} · {timeLabel(party.start_time)}</span>
          {party.preConvention && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(196,168,130,0.15)', color: '#C4A882' }}>
              Before the convention opens
            </span>
          )}
        </div>
        <p className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: '#8B7355' }}>{party.title}</p>

        {v ? (
          <>
            <h3 className="mt-2 text-base font-bold text-white">{v.name}</h3>
            {v.blurb && <p className="mt-2 text-sm leading-relaxed" style={{ color: '#bbb' }}>{v.blurb}</p>}
            {party.note && <p className="mt-2 text-sm font-semibold" style={{ color: '#C4A882' }}>{party.note}</p>}
            {v.address && (
              <a href={mapsUrl(v.address)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline underline-offset-2 transition-colors hover:text-white" style={{ color: '#C4A882' }}>
                {v.address}
              </a>
            )}
            {v.phone && <p className="mt-1 text-sm" style={{ color: '#999' }}>{v.phone}</p>}
            {links.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1">
                {links.map(l => {
                  const Icon = ICON[l.kind]
                  return (
                    <li key={l.kind}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label}
                         className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:text-white"
                         style={{ color: '#C4A882', backgroundColor: 'rgba(196,168,130,0.10)' }}>
                        <Icon size={20} aria-hidden="true" />
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : (
          party.note && <p className="mt-2 text-sm" style={{ color: '#bbb' }}>{party.note}</p>
        )}
      </div>
    </article>
  )
}
