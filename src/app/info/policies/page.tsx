'use client'

import PublicNav from '@/components/PublicNav'

const POLICIES = [
  {
    title: 'Age Policy',
    description: 'All ages are welcome at the convention. Attendees under the age of 16 must be accompanied by a parent or legal guardian at all times. You must be 18 years of age or older to receive tattoo services. Valid photo ID is required for tattoo services.',
  },
  {
    title: 'Weapons',
    description: 'No weapons of any kind are permitted inside the convention. This includes firearms, knives, and any items that could be used as a weapon. Exceptions are made only for authorized medieval combat performers who are part of the official entertainment program.',
  },
  {
    title: 'Photography',
    description: 'Personal photography and video are welcome throughout the convention. Please be respectful and ask permission before photographing artists at work or other attendees. Flash photography is not permitted during tattoo contest judging. Professional media must obtain a press pass in advance.',
  },
  {
    title: 'Re-Entry',
    description: 'Your wristband allows same-day re-entry to the convention. Do not remove your wristband if you plan to leave and return. Wristbands that have been cut, torn, or tampered with will not be honored for re-entry.',
  },
  {
    title: 'Refund Policy',
    description: 'All ticket sales are final. No refunds or exchanges will be issued. In the event of a convention cancellation, ticket holders will be notified via email with information about credits or rescheduled dates.',
  },
  {
    title: 'Pets & Service Animals',
    description: 'Only trained service animals as defined by the ADA are permitted inside the convention venue. Emotional support animals, therapy animals, and pets are not allowed. Service animals must be leashed or harnessed at all times.',
  },
  {
    title: 'Alcohol',
    description: 'Alcoholic beverages are available for purchase at designated areas within the convention. You must be 21 years of age or older with a valid photo ID to purchase or consume alcohol. Drink responsibly — visibly intoxicated attendees may be asked to leave.',
  },
  {
    title: 'Smoking',
    description: 'Smoking, vaping, and the use of tobacco products are prohibited inside the convention venue. Designated outdoor smoking areas are clearly marked near the entrance. Please dispose of cigarette butts in the provided receptacles.',
  },
]

const HEALTH_SAFETY = [
  {
    title: 'First Aid',
    description: 'A first aid station staffed by certified medical personnel is located on site throughout the convention. If you experience a medical emergency, alert the nearest staff member or security personnel immediately.',
  },
  {
    title: 'Tattoo Aftercare',
    description: 'A dedicated tattoo aftercare station is available where you can receive bandaging, cleaning supplies, and aftercare instructions from experienced professionals. Your artist will also provide specific aftercare guidance after your session.',
  },
  {
    title: 'Hygiene & Sanitation',
    description: 'All tattoo artists at AATC are required to maintain the highest standards of hygiene and sanitation. Artists must use single-use needles, sterile equipment, and disposable barriers. Health inspectors are on site throughout the event.',
  },
]

const CONDUCT_RULES = [
  'Treat all attendees, artists, vendors, and staff with respect and courtesy.',
  'Harassment of any kind — including verbal, physical, or sexual harassment — will not be tolerated.',
  'Discriminatory behavior based on race, gender, sexual orientation, religion, disability, or military branch is strictly prohibited.',
  'Do not touch other attendees, their tattoos, or their belongings without explicit consent.',
  'Follow the instructions of convention staff and security at all times.',
  'Report any concerns or incidents to the nearest staff member or security personnel.',
  'Violations of the code of conduct may result in immediate removal from the convention without refund.',
]

export default function PoliciesPage() {
  return (
    <div className="min-h-screen">
      <PublicNav />

      {/* Header */}
      <div className="border-b px-4 pb-10 pt-8 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">Know Before You Go</span>
        </p>
        <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
          <span className="text-emboss">Convention Policies</span>
        </h1>
        <p className="mx-auto mt-0 max-w-xl text-sm" style={{ color: '#999' }}>
          <span className="text-emboss">To ensure a safe, enjoyable experience for everyone, please review our convention policies before attending. These rules help us maintain an environment of respect and professionalism.</span>
        </p>
      </div>

      {/* General Rules */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">General Rules</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Policies that apply to all convention attendees</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {POLICIES.map((policy) => (
              <div
                key={policy.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{policy.title}</h3>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  {policy.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Health & Safety */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Health & Safety</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Your well-being is our priority</span>
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {HEALTH_SAFETY.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
              >
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code of Conduct */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Code of Conduct</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">Expected behavior for all attendees</span>
          </p>
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <ul className="space-y-3">
              {CONDUCT_RULES.map((rule, i) => (
                <li key={i} className="flex items-start gap-3 text-xs" style={{ color: '#999' }}>
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: '#8B7355' }} />
                  <span className="leading-relaxed">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border-t px-4 py-10 text-center" style={{ borderColor: '#2a2a2a' }}>
        <p className="mb-2 text-sm font-semibold text-white">
          <span className="text-emboss">Questions about our policies?</span>
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
