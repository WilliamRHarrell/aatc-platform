'use client'

import PublicNav from '@/components/PublicNav'

// REMOVED 2026-08-27: this held three fabricated fallen service members —
// full names, ranks, units, service dates and family-voice tributes — rendered
// under "In Memoriam" on the page Gold Star families are invited to submit to.
// Invented dead soldiers presented as real is the worst instance of the
// placeholder-human pattern in this codebase.
//
// NO PLACEHOLDER HUMANS. Nothing goes in this array that is not a real,
// family-confirmed honoree. Ship the empty state until then. When the CMS table
// lands, seed it EMPTY — do not migrate anything from git history.
const FEATURED_HONOREES: { name: string; branch: string; years: string; tribute: string }[] = []

const SUBMISSION_FIELDS = [
  { label: 'Service Member Name', description: 'Full name and rank of the service member being honored.' },
  { label: 'Branch of Service', description: 'The military branch in which they served.' },
  { label: 'Years of Service', description: 'The dates or years of their military service.' },
  { label: 'Photo', description: 'A high-resolution photo for the physical Wall of Honor display. Service photos, portraits, or family photos are all welcome.' },
  { label: 'Their Story', description: 'A brief tribute or story about the service member in your own words. Share who they were, what they meant to you, and how you would like them to be remembered.' },
  { label: 'Submitted By', description: 'Your name and your relationship to the service member.' },
]

export default function WallOfHonorPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Honoring Those Who Served</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Wall of Honor</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm leading-relaxed" style={{ color: '#999' }}>
         <span className="text-emboss"> <span className="text-emboss">A dedicated space at the All American Tattoo Convention honoring the service members who made the ultimate sacrifice. Their courage, dedication, and love of country will never be forgotten. Families and fellow service members are invited to submit photos and stories so that we may honor their memory together.</span></span>
        </p>
      </div>

      {/* About the Wall */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h2 className="text-lg font-bold text-white">
              A Place of Remembrance
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed" style={{ color: '#999' }}>
              The Wall of Honor is a physical display at the convention venue where photographs, names, and stories of fallen service members are presented with dignity and care. This is a quiet, contemplative space within the convention where attendees can pause, reflect, and pay their respects.
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed" style={{ color: '#999' }}>
              Every name on the wall represents a life of service, sacrifice, and love. We are honored to provide this space and deeply grateful to the families who trust us with their stories.
            </p>
            <div
              className="mx-auto mt-6 max-w-md rounded-xl p-4"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #8B7355' }}
            >
              <p className="text-sm font-semibold" style={{ color: '#C4A882' }}>
                50 Gold Star family members receive complimentary VIP access to the convention, courtesy of American Tattoo Society and the Cumberland County Crown Complex.
              </p>
              <p className="mt-2 text-xs" style={{ color: '#999' }}>
                Please contact us directly to arrange your passes. We are here to support you in every way we can.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Honorees */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">In Memoriam</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Honoring their service and sacrifice</span>
          </p>
          {FEATURED_HONOREES.length === 0 && (
            <div
              className="rounded-2xl px-6 py-10 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-sm" style={{ color: '#999' }}>
                The Wall of Honor is being assembled from family submissions. Names will
                appear here as families share them with us.
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURED_HONOREES.map((honoree) => (
              <div
                key={honoree.name}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <div
                  className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#2a2a2a', border: '2px solid #8B7355' }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-white">{honoree.name}</h3>
                  <p className="mt-1 text-xs font-medium" style={{ color: '#C4A882' }}>
                    {honoree.branch}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: '#666' }}>
                    {honoree.years}
                  </p>
                </div>
                <p className="mt-4 text-xs leading-relaxed" style={{ color: '#999' }}>
                  {honoree.tribute}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Submit */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Submit a Tribute</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Honor your service member on the Wall of Honor</span>
          </p>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="mb-6 text-sm leading-relaxed" style={{ color: '#999' }}>
              We welcome submissions from families, friends, and fellow service members who wish to honor a fallen hero on the Wall of Honor. To submit a tribute, please email the following information to{' '}
              <a href="mailto:wallofhonor@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
                wallofhonor@allamericantattooconvention.com
              </a>
            </p>
            <div className="space-y-4">
              {SUBMISSION_FIELDS.map((field) => (
                <div key={field.label} className="flex gap-3">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  <div>
                    <p className="text-xs font-bold text-white">{field.label}</p>
                    <p className="mt-1 text-xs" style={{ color: '#999' }}>{field.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs leading-relaxed" style={{ color: '#666' }}>
              All submissions are reviewed with care and respect. We will contact you to confirm receipt and let you know when your tribute has been added. Submissions are accepted on a rolling basis leading up to the convention.
            </p>
          </div>
        </div>
      </section>

      {/* Physical Wall Note */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <h2 className="text-lg font-bold text-white">
              The Wall at the Venue
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed" style={{ color: '#999' }}>
              The physical Wall of Honor is displayed in a dedicated area of the Crown Complex Event Center throughout the entire convention weekend. The space is designed to be a respectful, quiet area separate from the main convention floor. Attendees are encouraged to visit, pay their respects, and take a moment to reflect on the sacrifices made by these men and women.
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed" style={{ color: '#999' }}>
              Flowers, challenge coins, and small personal tokens may be left at the wall. All items will be carefully collected after the event and returned to the respective families.
            </p>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about the Wall of Honor?</span>
        </p>
        <p className="text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">Contact us at{' '}
          <a href="mailto:wallofhonor@allamericantattooconvention.com" style={{ color: '#C4A882' }}>
            wallofhonor@allamericantattooconvention.com
          </a></span>
        </p>
      </div>
    </div>
  )
}
