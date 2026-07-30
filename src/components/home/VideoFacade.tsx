'use client'

import { useState } from 'react'

/**
 * Lightweight YouTube facade: poster image plus play button, iframe mounted
 * only on click. A raw embed loads roughly a megabyte of YouTube JS on every
 * homepage visit and tanks Core Web Vitals on our most SEO-important page.
 *
 * ── VERTICAL VIDEO ──
 * The aspect box is driven by `orientation`, not assumed to be 16:9.
 *
 * Poster selection matters more than it looks. Every YouTube thumbnail
 * endpoint is 16:9 — maxresdefault (1280x720), hqdefault, sddefault,
 * mqdefault — so using any of them for a vertical video pillarboxes the poster
 * with black bars, even though the player itself renders correctly. The only
 * native-portrait endpoint is frame0.jpg (270x480), and `oardefault.jpg`
 * (which does return original aspect) is Shorts-only and 404s for a standard
 * upload. Verified against this video.
 *
 * So: a hand-picked `posterUrl` wins; otherwise frame0 for vertical and
 * maxresdefault for landscape. Never maxresdefault for vertical.
 */
export default function VideoFacade({
  youTubeId,
  title,
  orientation = 'landscape',
  posterUrl = null,
}: {
  youTubeId: string
  title: string
  orientation?: 'vertical' | 'landscape'
  posterUrl?: string | null
}) {
  const [playing, setPlaying] = useState(false)
  const isVertical = orientation === 'vertical'

  const poster =
    posterUrl ??
    (isVertical
      ? `https://i.ytimg.com/vi/${youTubeId}/frame0.jpg`
      : `https://i.ytimg.com/vi/${youTubeId}/maxresdefault.jpg`)

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        aspectRatio: isVertical ? '9 / 16' : '16 / 9',
        backgroundColor: '#111',
        border: '1px solid #2a2a2a',
      }}
    >
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1&rel=0&playsinline=1`}
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
            src={poster}
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
