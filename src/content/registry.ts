export type ContentType = 'text' | 'markdown'

export interface Section {
  label: string
  help?: string
  type: ContentType
  default: string
}

export type PageContentSchema = Record<string, Section>

export interface PageDef {
  key: string
  title: string // shown in the admin editor page-picker
  sections: PageContentSchema
}

export const REGISTRY: PageDef[] = [
  {
    key: 'home',
    title: 'Home / Pre-Register (/apply)',
    sections: {
      hero_eyebrow: { label: 'Hero eyebrow', type: 'text', default: 'Pre-Registration' },
      hero_title: { label: 'Hero title', type: 'text', default: 'Pre-Register for AATC' },
      hero_title_accent: { label: 'Hero title (gold accent)', type: 'text', default: 'Fayetteville 2027' },
      event_dates: { label: 'Event dates', type: 'text', default: 'Apr 16–18, 2027' },
      event_venue: { label: 'Venue name', help: 'Links to the venue map (link is fixed in code).', type: 'text', default: 'Crown Complex' },
      event_location: { label: 'City/State', type: 'text', default: 'Fayetteville, NC' },
      countdown_heading: { label: 'Countdown heading', type: 'text', default: 'Pre-Registration Opens In' },
      countdown_opens_text: { label: 'Countdown "opening" line', help: 'Display text only. The actual countdown target date is set in code.', type: 'text', default: 'Opening June 1, 2026' },
      countdown_calendar_cta: { label: 'Calendar link label', type: 'text', default: 'Mark Your Calendar' },
      cta_artist: { label: 'CTA — Artist button', type: 'text', default: 'Apply as Artist' },
      cta_vendor: { label: 'CTA — Vendor button', type: 'text', default: 'Apply as Vendor' },
      cta_sponsor: { label: 'CTA — Sponsor button', type: 'text', default: 'Become A Sponsor' },
      expect_title: { label: '"What to Expect" title', type: 'text', default: 'What to Expect When Applying' },
      expect_step1_title: { label: 'Step 1 title', type: 'text', default: 'Submit your application' },
      expect_step1_desc: { label: 'Step 1 description', type: 'markdown', default: 'Fill out a short form with your business info, preferred booth size, and artist count. No payment required upfront.' },
      expect_step2_title: { label: 'Step 2 title', type: 'text', default: 'Review and approval' },
      expect_step2_desc: { label: 'Step 2 description', type: 'markdown', default: 'Our team reviews every application. Approved applicants receive a confirmation email with their invoice and booth assignment.' },
      expect_step3_title: { label: 'Step 3 title', type: 'text', default: 'Secure your spot' },
      expect_step3_desc: { label: 'Step 3 description', type: 'markdown', default: 'Pay your invoice online via Stripe to lock in your booth. A printable confirmation and floor plan are available in your exhibitor portal.' },
      footer_name: { label: 'Footer name', type: 'text', default: 'ALL AMERICAN TATTOO CONVENTION' },
      footer_location: { label: 'Footer location', type: 'text', default: 'Crown Complex Event Center · Fayetteville, NC' },
    },
  },
  {
    key: 'tickets',
    title: 'Tickets (/tickets)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'April 16–18, 2027 · Fayetteville, NC' },
      header_title: { label: 'Header title', type: 'text', default: 'Buy Tickets' },
      header_intro: { label: 'Header intro', type: 'markdown', default: 'Secure your spot at the All American Tattoo Convention. Active military and veterans receive a $5 discount at the door with valid ID.' },
      passes_title: { label: '"Admission Passes" title', type: 'text', default: 'Admission Passes' },
      passes_footnote: { label: 'Passes footnote', type: 'markdown', default: 'Online purchases are subject to Ticketmaster service fees. To avoid fees, tickets may be purchased in person at the on-base Ft Bragg ticket office or the Crown Complex box office.' },
      schedule_title: { label: '"Schedule" title', type: 'text', default: 'Schedule of Events' },
      schedule_subtitle: { label: 'Schedule subtitle', type: 'text', default: 'Schedule is subject to change. Check back for updates.' },
      categories_title: { label: '"Contest Categories" title', type: 'text', default: 'Tattoo Contest Categories' },
      categories_subtitle: { label: 'Categories subtitle', type: 'text', default: 'Categories are subject to change. Final categories will be announced closer to the event.' },
      questions_title: { label: 'Questions title', type: 'text', default: 'Questions about tickets?' },
      questions_body: { label: 'Questions body', type: 'markdown', default: 'Contact us at [info@allamericantattooconvention.com](mailto:info@allamericantattooconvention.com)' },
    },
  },
  {
    key: 'contests',
    title: 'Contests (/contests)',
    sections: {
      header_title: { label: 'Header title', type: 'text', default: 'Tattoo Collectors Award' },
      header_subtitle: { label: 'Header subtitle', type: 'text', default: 'People’s Choice · Vote for your favorite in each category' },
      vote_hint: { label: 'Per-category vote hint', type: 'text', default: 'Tap a photo to enlarge · Select your favorite to vote' },
      empty_title: { label: 'Empty-state title', type: 'text', default: 'Voting opens soon' },
      empty_body: { label: 'Empty-state body', type: 'markdown', default: 'Check back after the convention to cast your votes.' },
      thankyou_title: { label: 'Thank-you title', type: 'text', default: 'Thank you for voting!' },
      thankyou_body: { label: 'Thank-you body', type: 'markdown', default: 'Your votes have been recorded. Winners will be announced at AATC 2027.' },
    },
  },
  {
    key: 'sponsors',
    title: 'Sponsors (/sponsors)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'Support Our Tattooed Military' },
      header_title: { label: 'Header title', type: 'text', default: 'Sponsor Directory' },
      header_intro: { label: 'Header intro', type: 'markdown', default: 'Thank you to our incredible sponsors who make the All American Tattoo Convention possible. Your support directly benefits our tattooed military community.' },
      empty_body: { label: 'Empty-state body', type: 'text', default: 'No sponsors confirmed yet for this event.' },
      cta_body: { label: 'CTA body', type: 'text', default: 'Interested in sponsoring AATC 2027?' },
      cta_button: { label: 'CTA button label', type: 'text', default: 'View Sponsorship Packages' },
    },
  },
]

export function getPageDef(pageKey: string): PageDef | undefined {
  return REGISTRY.find(p => p.key === pageKey)
}

/** Map of section_key -> default value for a page (used as fallback + seed). */
export function defaultsFor(pageKey: string): Record<string, string> {
  const def = getPageDef(pageKey)
  if (!def) return {}
  return Object.fromEntries(Object.entries(def.sections).map(([k, s]) => [k, s.default]))
}
