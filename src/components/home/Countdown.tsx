'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DOORS_OPEN_ISO, SHOW_CLOSE_ISO, EVENT_YEAR, showPhase, type ShowPhase } from '@/lib/event-config'

/**
 * Client island: the live countdown ticker.
 *
 * The server renders real values on first paint (state is seeded from the target
 * rather than zeroed), so there is never a flash of zeros and no-JS visitors
 * still see a correct day count. Times are absolute UTC instants, so a visitor
 * in California sees the same number as one in North Carolina.
 */
function remaining(targetMs: number) {
  const diff = targetMs - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="font-display text-3xl font-bold tabular-nums sm:text-5xl md:text-6xl"
        style={{ color: '#C4A882' }}
        suppressHydrationWarning
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-widest sm:text-xs" style={{ color: '#999999' }}>
        {label}
      </span>
    </div>
  )
}

function Separator() {
  return (
    <span className="mt-1 text-2xl font-bold sm:text-4xl" style={{ color: '#8B7355' }}>
      :
    </span>
  )
}

export default function Countdown() {
  const target = new Date(DOORS_OPEN_ISO).getTime()
  const [phase, setPhase] = useState<ShowPhase>(() => showPhase())
  const [timeLeft, setTimeLeft] = useState(() => remaining(target))

  useEffect(() => {
    const tick = () => {
      setPhase(showPhase())
      setTimeLeft(remaining(target))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  if (phase === 'during') {
    return (
      <div className="text-center">
        <p className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl" style={{ color: '#C4A882' }}>
          Happening Now
        </p>
        <Link
          href="/events/schedule"
          className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 transition-colors hover:text-white"
          style={{ color: '#C4A882' }}
        >
          See today’s schedule →
        </Link>
      </div>
    )
  }

  if (phase === 'after') {
    return (
      <div className="text-center">
        <p className="font-display text-2xl font-bold sm:text-3xl" style={{ color: '#C4A882' }}>
          That’s a wrap on AATC {EVENT_YEAR}
        </p>
        <p className="mt-2 text-sm" style={{ color: '#999999' }}>
          Dates for {EVENT_YEAR + 1} will be announced soon — follow us so you don’t miss it.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-center gap-4 sm:gap-8">
      <Unit value={timeLeft.days} label="Days" />
      <Separator />
      <Unit value={timeLeft.hours} label="Hours" />
      <Separator />
      <Unit value={timeLeft.minutes} label="Minutes" />
      <Separator />
      <Unit value={timeLeft.seconds} label="Seconds" />
    </div>
  )
}

/** Exported for tests/debugging: the window this countdown targets. */
export const COUNTDOWN_WINDOW = { open: DOORS_OPEN_ISO, close: SHOW_CLOSE_ISO }
