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
    title: 'Apply Hub (/apply)',
    sections: {
      hero_eyebrow: { label: 'Hero eyebrow', type: 'text', default: 'Applications Are Open' },
      hero_title: { label: 'Hero title', type: 'text', default: 'Applications Are Open for' },
      hero_title_accent: { label: 'Hero title (gold accent)', type: 'text', default: 'AATC 2027' },
      hero_intro: {
        label: 'Hero intro',
        type: 'markdown',
        default:
          'Everything you can apply for at the All American Tattoo Convention lives on this page. Booth applications are reviewed by our team; contest signups are first come, first served. Applications are open now — no pre-registration required.',
      },
      event_dates: { label: 'Event dates', type: 'text', default: 'April 16–18, 2027' },
      event_venue: { label: 'Venue name', help: 'Links to the venue map (link is fixed in code).', type: 'text', default: 'Crown Complex Event Center' },
      event_location: { label: 'City/State', type: 'text', default: 'Fayetteville, NC' },

      countdown_heading: { label: 'Countdown heading', type: 'text', default: 'AATC 2027 Begins In' },
      countdown_opens_text: {
        label: 'Countdown sub-line',
        help: 'Display text only. The countdown target date is set in code.',
        type: 'text',
        default: 'Doors open Friday, April 16, 2027 at 12:00 PM ET',
      },
      countdown_calendar_cta: { label: 'Calendar link label', type: 'text', default: 'Mark Your Calendar' },

      // ── Primary block: apply for a booth ──
      booth_block_title: { label: 'Booth block title', type: 'text', default: 'Apply for a Booth' },
      booth_block_tagline: {
        label: 'Booth block tagline',
        type: 'markdown',
        default: 'Artists, vendors, and food trucks — this is your home for AATC 2027.',
      },
      booth_block_body: {
        label: 'Booth block body',
        type: 'markdown',
        default:
          'Submit your application, our team reviews it, and approved applicants receive an invoice and booth assignment by email. Pay online through your exhibitor portal to lock in your spot. No payment is required to apply.',
      },
      cta_artist: { label: 'CTA — Artist button', type: 'text', default: 'Artist Booth Application' },
      cta_vendor: { label: 'CTA — Vendor button', type: 'text', default: 'Vendor Booth Application' },
      cta_food_truck: { label: 'CTA — Food truck button', type: 'text', default: 'Food Truck Application' },
      cta_sponsor: { label: 'CTA — Sponsor button', type: 'text', default: 'Become A Sponsor' },

      expect_title: { label: '"How it works" title', type: 'text', default: 'How It Works' },
      expect_step1_title: { label: 'Step 1 title', type: 'text', default: 'Submit your application' },
      expect_step1_desc: {
        label: 'Step 1 description',
        type: 'markdown',
        default: 'A short form with your business info, preferred booth size, and artist count.',
      },
      expect_step2_title: { label: 'Step 2 title', type: 'text', default: 'Review and approval' },
      expect_step2_desc: {
        label: 'Step 2 description',
        type: 'markdown',
        default:
          'Every application is reviewed by the AATC team. Approved applicants receive a confirmation email with their invoice and booth assignment.',
      },
      expect_step3_title: { label: 'Step 3 title', type: 'text', default: 'Secure your spot' },
      expect_step3_desc: {
        label: 'Step 3 description',
        type: 'markdown',
        default:
          'Pay your invoice online via Stripe. A printable confirmation and floor plan are available in your exhibitor portal.',
      },
      booth_info_link_text: {
        label: 'Booth info link line',
        help: 'Shown under the "How it works" steps.',
        type: 'markdown',
        default: 'Full booth pricing, inclusions, and health department requirements: see the Booth Information page.',
      },

      // ── Secondary application cards ──
      secondary_title: { label: 'Secondary section title', type: 'text', default: 'More Ways to Take Part' },
      pinup_title: { label: 'Pin-Up card title', type: 'text', default: 'Miss All American Pin-Up Contest' },
      pinup_body: {
        label: 'Pin-Up card body',
        type: 'markdown',
        default:
          'The 10th annual Miss All American Pin-Up Contest takes the main stage Saturday afternoon. Entries are limited — sign up early. You must hold a Saturday ticket to participate.',
      },
      pinup_cta: { label: 'Pin-Up card link label', type: 'text', default: 'Enter the Pin-Up Contest' },

      contests_title: { label: 'Tattoo contests card title', type: 'text', default: 'Tattoo Contests' },
      contests_body: {
        label: 'Tattoo contests card body',
        type: 'markdown',
        default:
          'Tattoo contest registration is **on-site only** — sign up at the registration desk on the show floor, opening at 1:00 PM daily. No online entry, so plan to arrive early on contest days.',
      },
      contests_cta: { label: 'Tattoo contests link label', type: 'text', default: 'Contest Rules & Categories' },

      honor_title: { label: 'Wall of Honor card title', type: 'text', default: 'Wall of Honor Submissions' },
      honor_body: {
        label: 'Wall of Honor card body',
        type: 'markdown',
        default:
          "Gold Star families and loved ones of distinguished veterans: share your hero's story for the AATC 2027 Wall of Honor. Submissions include photos and a written tribute, displayed at the show and on our website.",
      },
      honor_cta: { label: 'Wall of Honor link label', type: 'text', default: 'Submit a Wall of Honor Tribute' },

      sponsor_title: { label: 'Sponsor card title', type: 'text', default: 'Become a Sponsor' },
      sponsor_body: {
        label: 'Sponsor card body',
        type: 'markdown',
        default: 'Put your brand in front of thousands of tattoo enthusiasts, artists, and military supporters.',
      },
      sponsor_cta: { label: 'Sponsor card link label', type: 'text', default: 'View Sponsorship Packages' },

      volunteer_title: { label: 'Volunteer card title', type: 'text', default: 'Volunteer at AATC 2027' },
      volunteer_body: {
        label: 'Volunteer card body',
        type: 'markdown',
        default:
          "Want to be part of the crew that makes this show happen? We're accepting volunteer applications for 2027. Spots are limited and competitive — tell us who you are and how you'd like to help.",
      },
      volunteer_cta: { label: 'Volunteer card link label', type: 'text', default: 'Apply to Volunteer' },

      // ── Deadline strip ──
      deadline_title: { label: 'Deadline strip title', type: 'text', default: 'Deadline: March 15, 2027 — or until sold out.' },
      deadline_body: {
        label: 'Deadline strip body',
        type: 'markdown',
        default:
          'Booth applications, Pin-Up Contest entries, and Wall of Honor submissions all close March 15, 2027, but booths and Pin-Up spots close early when they’re gone. Every year they go before the deadline — apply early.',
      },

      footer_name: { label: 'Footer name', type: 'text', default: 'ALL AMERICAN TATTOO CONVENTION' },
      footer_location: { label: 'Footer location', type: 'text', default: 'Crown Complex Event Center · Fayetteville, NC' },
    },
  },
  {
    key: 'tickets',
    title: 'Tickets (/tickets)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'April 16–18, 2027 · Fayetteville, NC' },
      header_title: { label: 'Header title', type: 'text', default: 'Get Your Tickets to AATC 2027' },
      header_intro: {
        label: 'Header intro',
        type: 'markdown',
        default:
          '**Kids under 16 get in FREE.** $5 military discount available on all pass types. All passes sold through Ticketmaster — **2027 tickets go on sale in October 2026** at 2026 pricing.',
      },
      onsale_notice: {
        label: 'On-sale notice',
        help: 'Shown above the passes while Ticketmaster links are not yet live. Clear this field to hide the notice.',
        type: 'markdown',
        default:
          'Ticketmaster links for 2027 go live in October 2026. Check back then, or follow us on Instagram for the on-sale announcement.',
      },
      passes_title: { label: '"Admission Passes" title', type: 'text', default: 'Admission Passes' },

      // ── Pass pricing (editable so it can be corrected without a redeploy) ──
      price_vip: { label: 'VIP weekend pass price', type: 'text', default: '$70' },
      price_vip_note: { label: 'VIP price note', type: 'text', default: '$70 advance / $72 at the door · $5 military discount' },
      price_weekend: { label: 'Weekend pass price', type: 'text', default: '$60' },
      price_weekend_note: { label: 'Weekend price note', type: 'text', default: 'Advance · $5 military discount' },
      price_single_day: { label: 'Single-day pass price', type: 'text', default: '$25' },
      price_single_day_note: { label: 'Single-day price note', type: 'text', default: 'Any single day · $5 military discount' },

      passes_footnote: {
        label: 'Passes footnote',
        type: 'markdown',
        default:
          'Online purchases are subject to Ticketmaster service fees. To avoid fees, tickets may be purchased in person at the on-base Ft Bragg ticket office or the Crown Complex box office.',
      },
      schedule_title: { label: '"Schedule" title', type: 'text', default: 'Schedule of Events' },
      schedule_subtitle: { label: 'Schedule subtitle', type: 'text', default: 'Schedule is subject to change. Check back for updates.' },
      categories_title: { label: '"Contest Categories" title', type: 'text', default: 'Tattoo Contest Categories' },
      categories_subtitle: {
        label: 'Categories subtitle',
        type: 'text',
        default: 'Categories are subject to change. Final categories will be announced closer to the event.',
      },

      // ── Good to know ──
      goodtoknow_title: { label: '"Good to Know" title', type: 'text', default: 'Good to Know' },
      goodtoknow_body: {
        label: '"Good to Know" body',
        type: 'markdown',
        default:
          '- **Do I need a ticket to get tattooed?** Yes — admission is separate from your tattoo appointment.\n- **Kids under 16 are free.**\n- Contestants in the Miss All American Pin-Up Contest must hold a Saturday ticket.\n- The food truck rodeo out front is free and open to the public — no ticket required.',
      },

      questions_title: { label: 'Questions title', type: 'text', default: 'Questions about tickets?' },
      questions_body: {
        label: 'Questions body',
        type: 'markdown',
        default: 'Contact us at [info@allamericantattooconvention.com](mailto:info@allamericantattooconvention.com) or (910) 850-2566',
      },
    },
  },
  {
    key: 'contests',
    title: 'Collector’s Choice voting (/contests)',
    sections: {
      header_title: { label: 'Header title', type: 'text', default: 'AATC Collector’s Choice' },
      header_subtitle: { label: 'Header subtitle', type: 'text', default: 'People’s Choice · Vote for your favorite in each category' },
      header_intro: {
        label: 'Header intro',
        type: 'markdown',
        default:
          'Every tattoo done at the show is cataloged and posted here for **30 days of public voting** after the weekend ends. The winning collector takes home **$500** — and the winning artist earns a **free booth for next year**.',
      },
      vote_hint: { label: 'Per-category vote hint', type: 'text', default: 'Tap a photo to enlarge · Select your favorite to vote' },
      empty_title: { label: 'Empty-state title', type: 'text', default: 'Voting opens soon' },
      empty_body: {
        label: 'Empty-state body',
        type: 'markdown',
        default: 'Voting opens after the convention and runs for 30 days. Check back to cast your votes.',
      },
      thankyou_title: { label: 'Thank-you title', type: 'text', default: 'Thank you for voting!' },
      thankyou_body: {
        label: 'Thank-you body',
        type: 'markdown',
        default: 'Your votes have been recorded. Winners will be announced after voting closes.',
      },
    },
  },
  {
    key: 'sponsors',
    title: 'Sponsors (/sponsors)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'Support Our Tattooed Military' },
      header_title: { label: 'Header title', type: 'text', default: 'Our Sponsors' },
      header_intro: {
        label: 'Header intro',
        type: 'markdown',
        default:
          'The All American Tattoo Convention happens because of the companies below. When you support them, you support this show, our artists, and the military community we serve.',
      },
      empty_body: { label: 'Empty-state body', type: 'text', default: 'No sponsors confirmed yet for this event.' },
      cta_body: { label: 'CTA body', type: 'text', default: 'Want your brand here?' },
      cta_button: { label: 'CTA button label', type: 'text', default: 'Become a Sponsor' },
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
