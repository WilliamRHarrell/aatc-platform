import { TATTOO_BATTLE_PRESENTER } from '@/lib/event-config'
import { WHOLELIFE_INSTAGRAM } from '@/lib/tattoo-battle-config'
import type { PresenterRow } from '@/lib/tattoo-battle-data'
import { normalizeInstagram, safeHttpUrl } from '@/lib/tattoo-battle'

/**
 * "Presented by WholeLife Aftercare". Logo and link come from the confirmed
 * sponsorship row when it matches the presenter name; otherwise the name as
 * text (never a borrowed asset). Nothing about tier or money is read.
 */
export default function PresentedBy({ presenter, size = 'block' }: { presenter: PresenterRow | null; size?: 'hero' | 'block' }) {
  const name = TATTOO_BATTLE_PRESENTER
  // The website column is sponsor-editable from the portal; only http(s) reaches an href.
  const site = safeHttpUrl(presenter?.website)
  const handle = normalizeInstagram(presenter?.instagram)
  const ig = handle ? `https://instagram.com/${handle}` : WHOLELIFE_INSTAGRAM
  const logoH = size === 'hero' ? 'h-14 sm:h-20' : 'h-16 sm:h-24'
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.25em]" style={{ color: '#C4A882' }}>
        Presented by
      </p>
      {presenter?.logo_url ? (
        <a href={site ?? ig} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${name} website`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={presenter.logo_url} alt={name} className={`${logoH} w-auto object-contain`} loading={size === 'hero' ? 'eager' : 'lazy'} />
        </a>
      ) : (
        <p className="font-battle-slab text-2xl text-white">{name}</p>
      )}
      <a href={ig} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4" style={{ color: '#C4A882' }}>
        @{handle || 'wholelife.aftercare'} on Instagram
      </a>
    </div>
  )
}
