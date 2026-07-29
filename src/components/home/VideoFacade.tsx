'use client'

import { useState } from 'react'

/**
 * Lightweight YouTube facade: renders the poster image + play button, and only
 * mounts the iframe on click. A raw embed loads ~1MB of YouTube JS on every
 * homepage visit and tanks Core Web Vitals on our most SEO-important page.
 *
 * The 16:9 box is reserved up front so there is no layout shift when the
 * iframe swaps in.
 */
export default function VideoFacade({ youTubeId, title }: { youTubeId: string; title: string }) {
  const [playing, setPlaying] = useState(false)

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{ aspectRatio: '16 / 9', backgroundColor: '#111', border: '1px solid #2a2a2a' }}
    >
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full cursor-pointer"
          aria-label={`Play video: ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${youTubeId}/maxresdefault.jpg`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <span className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }} />
          <span
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundColor: 'rgba(139,115,85,0.92)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
