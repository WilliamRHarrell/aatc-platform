'use client'

import PublicNav from '@/components/PublicNav'

export default function DatingGamePage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Find Your Ink Match</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Tattoo Dating Game</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">One of the most entertaining events of the weekend. The Tattoo Dating Game brings audience participation, laughs, and a little romance to the main stage on Saturday evening.</span>
        </p>
      </div>

      {/* Event Details */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Event Details</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'When', value: 'Saturday, April 17 at 6:00 PM' },
              { label: 'Where', value: 'Main Stage' },
              { label: 'Cost', value: 'Free with Convention Admission' },
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
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How It Works</span>
          </h2>

          <div className="space-y-4">
            {[
              {
                step: '1',
                title: 'Sign Up to Play',
                desc: 'Sign up at the main stage contest table on Friday & Saturday starting at 1:00 PM.',
              },
              {
                step: '2',
                title: 'Take the Stage',
                desc: 'Inspired by classic TV dating shows, one contestant sits on one side of a partition while potential matches sit on the other. The contestants cannot see each other.',
              },
              {
                step: '3',
                title: 'Ask Your Questions',
                desc: 'The choosing contestant asks a series of fun, quirky, and tattoo-themed questions to the potential matches. Expect questions about ink preferences, first tattoo stories, and ideal date nights.',
              },
              {
                step: '4',
                title: 'Make Your Pick',
                desc: 'After the Q&A rounds, the choosing contestant picks their favorite match. The partition comes down and the two meet face to face on stage.',
              },
              {
                step: '5',
                title: 'Win Prizes Together',
                desc: 'The matched pair wins a Date Night — food and fun courtesy of our sponsors.',
              },
            ].map(item => (
              <div
                key={item.step}
                className="flex gap-4 rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: '#8B7355' }}
                >
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: '#999' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience Participation */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Audience Participation</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
              Even if you are not on stage, the audience plays a big role. Cheer for your favorites, shout suggestions, and enjoy the entertainment. The host will engage the crowd throughout the show, and audience members may have a chance to win giveaway prizes during the event.
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

          <div className="space-y-3">
            {[
              { label: 'Winning Couple', prize: 'A Date Night — food and fun courtesy of our sponsors' },
              { label: 'Runner-Up Contestants', prize: 'AATC merchandise package' },
              { label: 'Audience Giveaways', prize: 'Convention t-shirts, stickers, and sponsor swag' },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl p-5"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <span className="text-sm font-bold text-white">{item.label}</span>
                <span className="text-right text-xs" style={{ color: '#C4A882' }}>{item.prize}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Ready to find your ink match?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Sign up at the main stage contest table on Friday &amp; Saturday starting at 1:00 PM.</span>
        </p>
      </div>
    </div>
  )
}
