'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// useLayoutEffect warns during SSR on older React; fall back to useEffect there.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * A family's tribute, clamped to 8 lines with an in-place Read more / Show less
 * toggle. The toggle exists only while the text actually overflows the clamp
 * (or while expanded), so short tributes never show it. Overflow is measured on
 * the clamped element itself, on mount and on every window resize.
 */
export default function TributeText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Only a clamped element reveals overflow; while expanded keep the last result.
    const measure = () => {
      if (expanded) return
      setOverflowing(el.scrollHeight > el.clientHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [expanded, text])

  return (
    <div className="mt-4">
      {/* Families write paragraphs: keep their line breaks. */}
      <p
        ref={ref}
        className="whitespace-pre-line text-sm leading-relaxed"
        style={{
          color: '#999',
          ...(expanded
            ? {}
            : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 8, overflow: 'hidden' }),
        }}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs font-medium hover:opacity-80"
          style={{ color: '#C4A882' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
