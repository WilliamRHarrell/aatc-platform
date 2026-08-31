'use client'

import PublicNav from '@/components/PublicNav'
import PageGallery from '@/components/PageGallery'
import TeamSection from '@/components/TeamSection'

/**
 * The team section moved to the `team_members` table in migration 059 and is
 * rendered by src/components/TeamSection.tsx.
 *
 * THE REASONING MOVED WITH IT, and is repeated in both the migration and the
 * component rather than left here alone: three of the four people once listed
 * on this page did not exist, and Ryan's bio claimed he is an Army veteran when
 * he is not. Both were corrected. The corrected wording is seeded verbatim by
 * 059 and must not be reworded - see that file before editing either bio.

 */

const DIFFERENTIATORS = [
  {
    title: 'Military-Focused',
    description: 'Every aspect of AATC is designed with service members and veterans in mind, from discounted admission for active duty and veterans to dedicated programming that honors military culture.',
  },
  {
    // FACTUAL CORRECTION (spec §3.1). AATC is not veteran-owned - Ryan Harrell
    // is not a veteran. What is true is that the show platforms veteran-owned
    // businesses. Do not reword this back toward the original claim.
    title: 'Highlighting Veteran-Owned & Operated Businesses',
    description: 'AATC gives veteran-owned shops and businesses a place at the front of the show, and the founding family has deep roots in the Fort Bragg community.',
  },
  {
    title: 'Supporting Veteran Causes',
    description: 'A portion of every ticket sold goes directly to veteran support organizations. Our Wall of Honor provides a space for remembrance and healing.',
  },
  {
    title: 'World-Class Artists',
    description: 'We bring together elite tattoo artists from across the country, many of whom are veterans themselves, creating an unmatched experience for collectors.',
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Our Mission</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">About AATC</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">The All American Tattoo Convention celebrates the intersection of tattoo culture and military service. Founded to honor our tattooed service members and veterans, AATC is more than a convention - it is a gathering of community, respect, and artistry.</span>
        </p>
      </div>

      {/* What Makes AATC Different */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">What Makes AATC Different</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {DIFFERENTIATORS.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#999' }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* History */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Our Story</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">From a bold idea to a movement</span>
          </p>
          <div className="space-y-6">
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
                The All American Tattoo Convention was founded in 2025 with a clear purpose: to create a tattoo event that genuinely reflects the values, culture, and camaraderie of military life. What began as a vision shared among a small group of veterans and tattoo artists has grown into one of the most anticipated tattoo events in the Southeast.
              </p>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: '#999' }}>
                From its inaugural year, AATC has drawn thousands of attendees, hundreds of elite tattoo artists, and widespread support from veteran organizations across the country. The convention has raised funds for veteran mental health programs, supported Gold Star families, and provided a platform for service members to share their stories through ink.
              </p>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: '#999' }}>
                As we prepare for our 2027 convention, AATC continues to grow - not just in size, but in impact. Every year, we deepen our commitment to the military community and push the boundaries of what a tattoo convention can be.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Fayetteville */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Why Fayetteville?</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">The heart of the military community</span>
          </p>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#999' }}>
              Fayetteville, North Carolina is home to Fort Bragg - the largest military installation in the world by population. With over 50,000 active-duty soldiers and tens of thousands of veterans and military families calling the region home, there is no better place for a convention that honors the bond between tattoo culture and military service.
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#999' }}>
              The city&apos;s deep connection to the military runs through every neighborhood, business, and community organization. Fayetteville understands service, sacrifice, and the pride that comes with wearing your story on your skin. The Crown Complex Event Center provides a world-class venue just minutes from post, making it accessible to the massive military population in the region.
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#999' }}>
              Beyond the military connection, Fayetteville offers a thriving local tattoo scene, Southern hospitality, and easy access from major cities along the East Coast. It is, quite simply, where AATC belongs.
            </p>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <TeamSection />
      </section>
      <PageGallery slug="about" title="Around the Convention" className="mx-auto max-w-5xl px-4 py-12" />


      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Want to learn more?</span>
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
