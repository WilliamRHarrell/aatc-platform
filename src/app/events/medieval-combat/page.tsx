'use client'

import PublicNav from '@/components/PublicNav'

const DEMO_SCHEDULE = [
  {
    day: 'Friday, April 16',
    demos: [
      { time: '4:30 PM', title: 'Introduction to Armored Combat', desc: 'Meet the fighters, learn about the armor and weapons, and watch warm-up bouts.' },
      { time: '7:00 PM', title: 'Full-Contact Exhibition Fights', desc: 'One-on-one duels and small group melees under tournament rules.' },
    ],
  },
  {
    day: 'Saturday, April 17',
    demos: [
      { time: '12:00 PM', title: 'Armor & Weapons Demonstration', desc: 'An up-close look at historical armor, swords, shields, and axes. Fighters explain their gear and answer questions from the audience.' },
      { time: '2:30 PM', title: 'Tournament Bouts', desc: 'Bracket-style tournament fights. Full-contact steel-on-steel combat with elimination rounds.' },
      { time: '5:30 PM', title: 'Team Melee', desc: 'Two teams clash in a full-contact group battle. The last team standing wins.' },
    ],
  },
  {
    day: 'Sunday, April 18',
    demos: [
      { time: '12:00 PM', title: 'Open Q&A and Armor Try-On', desc: 'Audience members can try on helmets and gauntlets, ask questions, and take photos with the fighters.' },
      { time: '3:00 PM', title: 'Grand Finale Championship', desc: 'The final championship bout of the weekend. The top fighters from Saturday compete for the title of AATC Armored Combat Champion.' },
    ],
  },
]

export default function MedievalCombatPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Steel Meets Ink</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Medieval Armored Combat</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Experience the raw power and spectacle of full-contact medieval armored combat right on the convention floor. Real steel. Real armor. Real fighters. This is not choreographed -- it is full-contact sport fighting in historical armor.</span>
        </p>
      </div>

      {/* What to Expect */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">What to Expect</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: 'Full-Contact Fighting',
                desc: 'Armored fighters engage in real combat using steel swords, axes, maces, and shields. Fights are governed by international rules and supervised by experienced marshals.',
              },
              {
                title: 'Historical Armor & Weapons',
                desc: 'All armor and weapons are based on historical designs from the 13th to 16th centuries. Fighters wear full plate armor weighing 60 to 90 pounds.',
              },
              {
                title: 'One-on-One Duels',
                desc: 'Individual fighters face off in timed bouts. Victory is achieved through points scored by clean strikes, or by forcing an opponent to the ground.',
              },
              {
                title: 'Team Melees',
                desc: 'Groups of fighters clash in organized team battles. Coordination, strategy, and brute force determine the winning team in these chaotic and thrilling fights.',
              },
            ].map(item => (
              <div
                key={item.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Schedule */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Demonstration Schedule</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">All demonstrations take place at the Arena Area on the convention floor.</span>
          </p>

          <div className="space-y-6">
            {DEMO_SCHEDULE.map(day => (
              <div key={day.day}>
                <h3
                  className="mb-3 rounded-xl px-5 py-3 text-center text-sm font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  {day.day}
                </h3>

                <div className="space-y-3">
                  {day.demos.map((demo, i) => (
                    <div
                      key={i}
                      className="flex gap-4 rounded-2xl p-5"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    >
                      <span className="w-20 shrink-0 text-right text-xs font-medium" style={{ color: '#C4A882' }}>
                        {demo.time}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-white">{demo.title}</h4>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: '#999' }}>{demo.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety Note */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h3 className="mb-2 text-sm font-bold text-white">Safety & Viewing</h3>
            <p className="text-xs leading-relaxed" style={{ color: '#999' }}>
              All combat demonstrations take place within a designated arena with safety barriers. Spectators can watch from a safe distance around the perimeter. The arena area is supervised at all times by trained marshals and safety personnel. While the combat is full-contact, all fighters are experienced competitors in certified armor. This event is safe for all ages to watch.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Interested in bringing your team to compete?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Contact us at{' '}
          <a href="mailto:info@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            info@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
