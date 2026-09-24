import type { ReactNode } from 'react'

/**
 * Section chrome for the Battle pages: black band, optional ink-splatter edge
 * strips (alpha PNGs from the campaign frames, edges only), condensed kicker
 * and distressed display title. Real text throughout.
 */
export default function BattleSection({
  id, kicker, title, children, splatter, className = '',
}: {
  id?: string
  kicker?: string
  title: string
  children: ReactNode
  splatter?: 'top' | 'bottom' | 'both'
  className?: string
}) {
  const top = splatter === 'top' || splatter === 'both'
  const bottom = splatter === 'bottom' || splatter === 'both'
  return (
    <section id={id} className={`relative border-t px-4 py-14 ${className}`} style={{ borderColor: '#2a2a2a' }}>
      {top && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-top.png)', backgroundSize: 'auto 100%' }} />
      )}
      <div className="relative mx-auto max-w-4xl">
        {kicker && (
          <p className="mb-2 text-center font-battle-condensed text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#C4A882' }}>
            <span className="text-emboss">{kicker}</span>
          </p>
        )}
        <h2 className="mb-8 text-center font-battle-display text-3xl uppercase text-white sm:text-4xl">
          <span className="text-emboss">{title}</span>
        </h2>
        {children}
      </div>
      {bottom && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-repeat-x opacity-70"
             style={{ backgroundImage: 'url(/images/tattoo-battle/splatter-bottom.png)', backgroundSize: 'auto 100%' }} />
      )}
    </section>
  )
}
