'use client'

import PublicNav from '@/components/PublicNav'

const EVENTS = [
  {
    title: 'Deadlift Challenge',
    description: 'Test your raw pulling power. Competitors attempt progressively heavier deadlifts in a last-man-standing format. Weight classes available for fair competition.',
  },
  {
    title: 'Arm Wrestling Tournament',
    description: 'A bracket-style arm wrestling tournament open to all skill levels. Left and right hand divisions. Think you have what it takes to be champion? Step up to the table.',
  },
  {
    title: 'Grip Strength Challenge',
    description: 'Crush a dynamometer for the highest reading, hold a loaded barbell for time, or hang from a bar until you drop. Multiple grip events test every aspect of hand and forearm strength.',
  },
  {
    title: 'Atlas Stone Carry',
    description: 'Lift a heavy atlas stone and carry it as far as you can. Inspired by strongman competition, this event is a crowd favorite and a true test of full-body power.',
  },
  {
    title: 'Keg Toss',
    description: 'Launch an empty keg over a bar set at increasing heights. Explosive power meets technique in this classic strongman event adapted for the sideshow stage.',
  },
  {
    title: 'Truck Pull (Exhibition)',
    description: 'Watch as top competitors attempt to pull a military vehicle across the parking lot. This exhibition event is open to select competitors and draws massive crowds.',
  },
]

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

      {/* Schedule */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">When & Where</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Friday', value: '5:30 PM - Exhibition Events' },
              { label: 'Saturday', value: '2:00 PM - Open Competitions' },
              { label: 'Sunday', value: '1:30 PM - Finals & Champions' },
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

          <div className="grid gap-4 sm:grid-cols-2">
            {EVENTS.map(event => (
              <div
                key={event.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{event.title}</h3>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{event.description}</p>
              </div>
            ))}
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
            <ul className="space-y-3">
              {[
                'Registration is available at the Sideshow Stage area. Walk-up registration is accepted on event days.',
                'Competitors must be 18 years or older and sign a liability waiver before participating.',
                'No entry fee required. All competitions are free to enter with your convention admission.',
                'Weight classes are available for the Deadlift Challenge and Arm Wrestling Tournament.',
                'Competitors should wear appropriate athletic clothing and closed-toe shoes.',
                'The Truck Pull is an exhibition event with select competitors. Inquire at the booth for details.',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Prizes */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Prizes</span>
          </h2>

          <div className="space-y-3">
            {[
              { place: 'Event Winners', prize: 'Custom Medal + Bragging Rights' },
              { place: 'Overall Strongest (Sunday Finals)', prize: 'Custom Trophy + $300 Cash + AATC Champion Belt' },
              { place: 'Military Division Winner', prize: 'Custom Trophy + $200 Cash' },
            ].map(item => (
              <div
                key={item.place}
                className="flex items-center justify-between rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <span className="text-sm font-bold text-white">{item.place}</span>
                <span className="text-right text-xs" style={{ color: '#C4A882' }}>{item.prize}</span>
              </div>
            ))}
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
