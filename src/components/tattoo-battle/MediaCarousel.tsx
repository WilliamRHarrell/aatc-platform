'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { MediaItem } from '@/lib/tattoo-battle'
import { mediaPublicUrl } from '@/lib/tattoo-battle'

/**
 * Phone-first swipe carousel: CSS scroll-snap, prev/next buttons, dots.
 * The first item loads eagerly; everything after it is lazy (images via
 * loading="lazy", videos via preload="none"). Videos are playsInline + muted
 * with controls and a poster, so nothing autoplays with sound on a show floor.
 */
export default function MediaCarousel({ items, alt }: { items: MediaItem[]; alt: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const go = (i: number) => {
    const el = track.current
    if (!el) return
    const clamped = Math.max(0, Math.min(items.length - 1, i))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }
  const onScroll = () => {
    const el = track.current
    if (!el) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (items.length === 0) return null

  return (
    <div className="relative">
      <div ref={track} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-black" style={{ scrollbarWidth: 'none' }} aria-roledescription="carousel">
        {items.map((m, i) => (
          <div key={m.path} className="relative aspect-[4/5] w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            {m.type === 'image' ? (
              <Image src={mediaPublicUrl(m.path)} alt={alt} fill sizes="100vw" className="object-contain" priority={i === 0} loading={i === 0 ? 'eager' : 'lazy'} />
            ) : (
              <video
                className="h-full w-full object-contain"
                src={mediaPublicUrl(m.path)}
                poster={m.poster_path ? mediaPublicUrl(m.poster_path) : undefined}
                playsInline muted controls
                preload={i === 0 ? 'metadata' : 'none'}
                aria-label={alt}
              />
            )}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-lg font-bold text-black" style={{ backgroundColor: '#C4A882' }}>‹</button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-2 text-lg font-bold text-black" style={{ backgroundColor: '#C4A882' }}>›</button>
          <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Slides">
            {items.map((m, i) => (
              <button key={m.path} type="button" role="tab" aria-selected={i === index} aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)}
                      className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i === index ? '#C4A882' : '#444' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
