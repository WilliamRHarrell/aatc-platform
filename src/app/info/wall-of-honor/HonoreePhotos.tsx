'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

/**
 * An honoree's photos: the main photo (the first) plus a row of the others.
 * Any photo opens full size; arrows and the keyboard step through them.
 * URLs are the public wall-of-honor bucket's, built by the server page.
 */
export default function HonoreePhotos({
  urls,
  name,
  focus,
}: {
  urls: string[]
  name: string
  /** Parallel to urls: the crop focus point (percent) per photo; null = default upper-center. */
  focus?: ({ x: number; y: number } | null)[]
}) {
  const pos = (i: number) => {
    const f = focus?.[i]
    return { objectPosition: f ? `${f.x}% ${f.y}%` : '50% 25%' }
  }
  const [open, setOpen] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const isOpen = open !== null

  // Focus moves to Close on open and back to the photo that opened it on close.
  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    return () => { triggerRef.current?.focus() }
  }, [isOpen])

  const show = (i: number) => (e: React.MouseEvent<HTMLElement>) => {
    triggerRef.current = e.currentTarget
    setOpen(i)
  }

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i + 1) % urls.length))
      else if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i - 1 + urls.length) % urls.length))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, urls.length])

  if (urls.length === 0) return null
  const [main, ...rest] = urls

  return (
    <>
      {/* next/image resizes the up-to-10 MB originals; cards sit in a 2-column grid from md up. */}
      <button type="button" onClick={show(0)} className="relative block h-72 w-full" aria-label={`View photo of ${name}`}>
        <Image src={main} alt={name} fill className="object-cover" style={pos(0)} sizes="(min-width: 768px) 50vw, 100vw" />
      </button>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          {rest.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={show(i + 1)}
              className="relative h-14 w-14 overflow-hidden rounded-lg"
              style={{ border: '1px solid #2a2a2a' }}
              aria-label={`View photo ${i + 2} of ${urls.length} of ${name}`}
            >
              <Image src={url} alt="" fill className="object-cover" style={pos(i + 1)} sizes="56px" />
            </button>
          ))}
        </div>
      )}

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photos of ${name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setOpen(null)}
        >
          {/* The lightbox deliberately serves the full-size original (plain img, no resize). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[open]}
            alt={open === 0 ? name : `Photo ${open + 1} of ${urls.length} of ${name}`}
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {urls.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white hover:opacity-70"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                onClick={e => { e.stopPropagation(); setOpen((open - 1 + urls.length) % urls.length) }}
                aria-label="Previous photo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white hover:opacity-70"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                onClick={e => { e.stopPropagation(); setOpen((open + 1) % urls.length) }}
                aria-label="Next photo"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </>
          )}
          <button
            type="button"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-white hover:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
            ref={closeRef}
            onClick={() => setOpen(null)}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
    </>
  )
}
