import PublicNav from '@/components/PublicNav'
import Markdown from '@/components/Markdown'
import { getContent } from '@/content/getContent'
import { CONTACT_EMAIL, VENUE_POLICIES_URL } from '@/lib/event-config'
import { pageMetadata, titled, atTheShow } from '@/lib/page-meta'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata('/info/policies', {
  title: titled('Convention Policies'),
  description: atTheShow('Convention and venue policies (bags, drinks, re-entry)'),
})

// Re-entry, weapons, smoking and animals live in the venue policies section
// (registry 'policies'), not here: one home per rule.
const POLICIES = [
  {
    title: 'Age Policy',
    description: 'All ages are welcome at the convention. Attendees under the age of 16 must be accompanied by a parent or legal guardian at all times. You must be 18 years of age or older to receive tattoo services. Valid photo ID is required for tattoo services.',
  },
  {
    title: 'Photography',
    description: 'Personal photography and video are welcome throughout the convention. Please be respectful and ask permission before photographing artists at work or other attendees. Flash photography is not permitted during tattoo contest judging. Professional media must obtain a press pass in advance.',
  },
  {
    title: 'Refund Policy',
    description: 'All ticket sales are final. No refunds or exchanges will be issued. In the event of a convention cancellation, ticket holders will be notified via email with information about credits or rescheduled dates.',
  },
  {
    title: 'Alcohol',
    description: 'Alcoholic beverages are available for purchase at designated areas within the convention. You must be 21 years of age or older with a valid photo ID to purchase or consume alcohol. Drink responsibly - visibly intoxicated attendees may be asked to leave.',
  },
]

const HEALTH_SAFETY = [
  {
    title: 'First Aid',
    description: 'A first aid station staffed by certified medical personnel is located on site throughout the convention. If you experience a medical emergency, alert the nearest staff member or security personnel immediately.',
  },
  {
    title: 'Aftercare',
    description: 'Aftercare products are available for purchase from several booths throughout the convention floor, including Skin Reserve, WholeLife Aftercare, and After Inked, among others. Your artist will walk you through caring for fresh work before you leave the booth.',
  },
  {
    title: 'Hygiene & Sanitation',
    description: 'All tattoo artists at AATC are required to maintain the highest standards of hygiene and sanitation. Artists must use single-use needles, sterile equipment, and disposable barriers. Health inspectors are on site throughout the event.',
  },
]

const CONDUCT_RULES = [
  'Treat all attendees, artists, vendors, and staff with respect and courtesy.',
  'Harassment of any kind - including verbal, physical, or sexual harassment - will not be tolerated.',
  'Discriminatory behavior based on race, gender, sexual orientation, religion, disability, or military branch is strictly prohibited.',
  'Do not touch other attendees, their tattoos, or their belongings without explicit consent.',
  'Follow the instructions of convention staff and security at all times.',
  'Report any concerns or incidents to the nearest staff member or security personnel.',
  'Violations of the code of conduct may result in immediate removal from the convention without refund.',
]

const CARD = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' } as const

export default async function PoliciesPage() {
  const c = await getContent('policies')
  const venue = [
    { title: c.venue_bags_title, body: c.venue_bags_body },
    { title: c.venue_food_title, body: c.venue_food_body },
    { title: c.venue_reentry_title, body: c.venue_reentry_body },
    { title: c.venue_other_title, body: c.venue_other_body },
  ]

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

      {/* Crown Complex venue policies - editable at /admin/content ("Policies").
          Bags, drinks and re-entry first. */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">{c.venue_title}</span>
          </h2>
          <div className="mx-auto mb-8 max-w-2xl text-center text-xs leading-relaxed" style={{ color: '#999' }}>
            <Markdown>{c.venue_intro}</Markdown>
            <p className="mt-2">
              <a
                href={VENUE_POLICIES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                style={{ color: '#C4A882' }}
              >
                Crown Complex venue policies (official)
              </a>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {venue.map((item) => (
              <div key={item.title} className="rounded-2xl p-6" style={CARD}>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <div className="mt-3 space-y-3 text-xs leading-relaxed" style={{ color: '#999' }}>
                  <Markdown>{item.body}</Markdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* General Rules */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
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

      {/* Your Information - added with the pinup contest intake, which is the
          first place the site collects contact details from the public. Written
          to be true of what the code actually does, not aspirational: consent is
          a separate unticked box, it is never a condition of entry, and the
          timestamp is set server-side. If any of those change, this changes. */}
      <section className="border-t px-4 py-12" style={{ borderColor: '#2a2a2a' }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
            <span className="text-emboss">Your Information</span>
          </h2>
          <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
            <span className="text-emboss">What we collect, why, and how to stop it</span>
          </p>
          <div
            className="space-y-5 rounded-2xl p-6 text-xs leading-relaxed"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', color: '#999' }}
          >
            <div>
              <p className="mb-1 font-bold text-white">What we collect</p>
              <p>
                When you register for a contest we collect your name, email address and phone
                number, and your mailing address if you provide one. If you create an account
                to vote, we collect your email address. We do not collect payment details on
                this site for contest entry.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">Why we collect it</p>
              <p>
                To run the thing you signed up for. That means confirming your place, telling
                you where and when to check in, and contacting you if the schedule changes.
                These messages are part of the contest and are sent to everyone who enters.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">We never share it</p>
              <p>
                We do not sell, rent, trade or share your information with anyone. It is used
                by AATC only. Sponsors do not receive it, and neither does anyone else.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">Marketing is opt-in, and optional</p>
              <p>
                We only email you about future events, ticket presales and next year&apos;s
                dates if you tick the box asking us to. It is never ticked for you, and it is
                never required - you can enter a contest, or vote, without opting in, and
                nothing about your entry changes either way.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">Photography at the contest</p>
              <p>
                Entering the Miss AATC Pinup Contest requires agreeing to be photographed at
                the convention and to AATC using those photographs to promote the convention.
                This one <strong className="text-white">is</strong> required, unlike the
                marketing opt-in above, and the reason is specific: the first place prize
                includes a photo shoot, so it cannot be awarded to a contestant who has not
                agreed to be photographed. It is a separate checkbox and it is not ticked for
                you. If you would rather not be photographed, the contest is not something we
                can enter you into - but nothing else on this site asks for it.
              </p>
            </div>
            <div>
              <p className="mb-1 font-bold text-white">How to unsubscribe</p>
              <p>
                Every marketing email has an unsubscribe option, or you can reply to any of
                them with UNSUBSCRIBE, or email{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#C4A882' }}>
                  {CONTACT_EMAIL}
                </a>
                . Unsubscribing stops event and presale email. It does not stop messages about
                a contest you have entered - those carry your check-in time and any schedule
                change, so we keep sending them until the show is over.
              </p>
            </div>
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
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#C4A882' }}>
            {CONTACT_EMAIL}
          </a></span>
        </p>
      </div>
    </div>
  )
}
