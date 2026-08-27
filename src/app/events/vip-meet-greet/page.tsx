'use client'

import PublicNav from '@/components/PublicNav'

const WHAT_INCLUDED = [
  {
    title: 'Meet TV Tattoo Artists',
    description: 'Get face-to-face with tattoo artists you have seen on your favorite TV shows. This is your chance for a personal conversation, not just a wave from across the floor.',
  },
  {
    title: 'Autographs & Photos',
    description: 'Bring your favorite prints, books, or merchandise to get signed. Personal photos with the artists are welcome and encouraged.',
  },
  {
    title: 'Exclusive AATC Poster',
    description: 'Every VIP attendee at the meet and greet receives an exclusive limited-edition AATC convention poster, signed by the featured artists.',
  },
  {
    title: 'Early Convention Access',
    description: 'The meet and greet takes place during VIP early admission, giving you 30 minutes on the convention floor before general admission doors open at 10:30 AM.',
  },
]

const FEATURED_ARTISTS = [
  {
    name: 'Artist Announcement Coming Soon',
    bio: 'Featured TV tattoo artists will be announced as they are confirmed. Follow our social media channels for the latest announcements.',
  },
  {
    name: 'Artist Announcement Coming Soon',
    bio: 'We are in active discussions with well-known artists from popular tattoo competition shows. Check back for updates.',
  },
  {
    name: 'Artist Announcement Coming Soon',
    bio: 'Additional featured guests will be revealed in the weeks leading up to the convention.',
  },
]

export default function VipMeetGreetPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">An Exclusive Experience</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Gold Star VIP Meet & Greet</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">An exclusive Saturday morning experience reserved for VIP 3-Day Pass holders. Meet renowned TV tattoo artists, get autographs, and take home a signed limited-edition poster before the convention floor opens to the public.</span>
        </p>
      </div>

      {/* Event Details */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Event Details</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Date', value: 'Saturday, April 17' },
              { label: 'Time', value: '10:00 AM' },
              { label: 'Location', value: 'VIP Lounge' },
              { label: 'Access', value: 'VIP 3-Day Pass Only' },
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

      {/* What's Included */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">What Is Included</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {WHAT_INCLUDED.map(item => (
              <div
                key={item.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── §13.2 Gold Star Families ────────────────────────
          Deliberately plain. Gold Star means a family that lost a service
          member; this is not a promotion and must not read like one. No
          exclamation points, no "don't miss out", no urgency language beyond
          the factual "first come, first served".

          No phone number or email is listed — §17.5 is open, and ACS
          coordinator contacts change. A stale number on THIS page is worse
          than none, because the person dialling it is already dealing with
          enough. */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Gold Star Families</span>
          </h2>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#bbb' }}>
              American Tattoo Society donates VIP passes to Gold Star Family members. To sign
              up, contact the Army Community Service Survivor Outreach Services Support
              Coordinator, USAG Fort Bragg. Passes are first come, first served.
            </p>
          </div>
        </div>
      </section>

      {/* ── §13.4 Panel access ──────────────────────────────
          Worded so it does not imply VIPs are shut out of something that
          exists. Every seminar currently scheduled for 2027 — Bookkeeping for
          Tattoo Industry Professionals and the Tooth Gem Seminar — is free and
          open to all attendees, so the paid-panel caveat is forward-looking
          rather than a live restriction. If a paid panel is ever added, this
          copy already covers it. */}
      <section className="border-t px-4 py-10" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: 'rgba(139,115,85,0.08)', border: '1px solid #2a2a2a' }}
          >
            <p className="text-xs leading-relaxed" style={{ color: '#999' }}>
              <strong className="text-white">Panels and seminars.</strong> Every seminar on the
              2027 schedule is free and open to all attendees — a VIP ticket is not needed for
              any of them. Should a paid panel be added later, a VIP ticket would not include
              entry to it.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Artists */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Featured Artists</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Artist announcements are coming soon. Follow us on social media for updates.</span>
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURED_ARTISTS.map((artist, i) => (
              <div
                key={i}
                className="rounded-2xl p-6 text-center"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#2a2a2a' }}
                >
                  <span className="text-2xl font-bold" style={{ color: '#555' }}>?</span>
                </div>
                <h3 className="text-sm font-bold text-white">{artist.name}</h3>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: '#999' }}>{artist.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VIP Pass Info */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">How to Get Access</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '2px solid #8B7355' }}
          >
            <h3 className="text-lg font-bold text-white">VIP 3-Day Pass</h3>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#C4A882' }}>$70</p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: '#999' }}>
              The Gold Star VIP Meet & Greet is included with every VIP 3-Day Pass. Your VIP pass also includes a special convention badge, swag bag, meet-and-greet poster, and an official AATC t-shirt.
            </p>
            <div className="mt-5">
              <a
                href="/tickets#vip"
                className="inline-block rounded-lg px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#8B7355' }}
              >
                Get Your VIP Pass
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Additional VIP Benefits */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Full VIP Benefits</span>
          </h2>

          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <ul className="space-y-2.5">
              {[
                'Special convention badge',
                'Swag bag',
                'Meet-and-greet poster',
                'Official AATC t-shirt',
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs" style={{ color: '#999' }}>
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about the VIP experience?</span>
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
