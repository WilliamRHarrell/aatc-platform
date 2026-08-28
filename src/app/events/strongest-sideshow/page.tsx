'use client'

import PublicNav from '@/components/PublicNav'

/**
 * 2027 IS TEAM STRONGMAN ONLY.
 *
 * This page previously listed six individual events — Deadlift Challenge, Arm
 * Wrestling, Grip Strength, Atlas Stone Carry, Keg Toss and a military-vehicle
 * Truck Pull — with formats, weight classes and rules. None of that is running.
 * Dead-lift and bench were dropped for 2027 and the event is now a team
 * competition whose lineup has not been announced.
 *
 * Removed rather than trimmed: a partial list of invented events reads as
 * confirmed programming to someone deciding whether to enter.
 */

export default function StrongestSideshowPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Feats of Strength & Spectacle</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Strongest at the Sideshow</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Brute strength meets tattoo culture in this crowd-pumping series of strength competitions. Open to attendees who think they have what it takes. Watch or compete -- either way, you will not want to miss it.</span>
        </p>
      </div>

      {/* ── §11.2 Logo, between hero and "When & Where" ────────
          Renders nothing until the asset exists. The file is not in the repo
          yet (§0.3 lists it as provided, but it has not landed) and §0.8 says
          no broken image icons and no reserved blank space - so this hides
          itself on error rather than showing Next's broken-image frame.

          NOTE: this is the LIGHT-BACKGROUND logo on a #0a0a0a page. Verify it
          reads correctly once it lands; if it disappears into the dark, a
          dark-background variant is needed (§17.3). */}
      <div className="flex justify-center px-4 py-10">
        <img
          src="/images/events/strongest-at-sideshow.png"
          alt="Strongest at the Sideshow"
          width={360}
          height={360}
          loading="lazy"
          className="h-auto w-full max-w-[360px]"
          onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
        />
      </div>

      {/* Schedule */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">When & Where</span>
          </h2>

          {/* 2027 is a SINGLE Saturday session, team strongman only. The Friday
              and Sunday rows here were stale multi-day content and the Saturday
              time (2:00 PM) disagreed with both other places the time lived.
              Strongman time now lives in exactly two places - the schedule_items
              seed and homepage-content.ts - both 1:00 PM. Do not reintroduce a
              third copy here; link to the schedule instead. */}
          <div className="grid gap-4 sm:grid-cols-1">
            {[
              { label: 'Saturday', value: '1:00 PM - Team Strongman, Crown Ballroom' },
            ].map(item => (
              <div
                key={item.label}
                className="rounded-2xl p-5 text-center"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#666' }}>{item.label}</p>
                <p className="mt-2 text-sm font-medium text-white">{item.value}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">All events take place at the Sideshow Stage area on the convention floor.</span>
          </p>
        </div>
      </section>

      {/* Events */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Competition Events</span>
          </h2>
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>
              Strongest at the Sideshow is a <strong className="text-white">team strongman
              competition</strong>. Event lineup and team sign-up details will be announced soon.
            </p>
          </div>
        </div>
      </section>

      {/* How to Compete */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How to Compete</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-center text-sm" style={{ color: '#999' }}>
              More information coming soon.
            </p>
          </div>
        </div>
      </section>

      {/* Prizes */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Prizes</span>
          </h2>

          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm" style={{ color: '#999' }}>Prizes will be announced soon.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Think you are the strongest at the show?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Register at the Sideshow Stage or contact{' '}
          <a href="mailto:info@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            info@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
