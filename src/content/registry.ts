import { COLLECTORS_CHOICE_PRIZE } from '@/lib/event-config'

export type ContentType = 'text' | 'markdown' | 'boolean' | 'url'

/** Booleans are stored as the strings 'true'/'false' in page_content.content. */
export function isTrue(value: string | undefined): boolean {
  return value === 'true'
}

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
    key: 'homepage',
    title: 'Homepage (/)',
    sections: {
      hero_eyebrow: { label: 'Hero eyebrow', type: 'text', default: 'April 16-18, 2027 · Fayetteville, NC' },
      hero_title: { label: 'Hero title (H1)', help: 'Must contain "All American Tattoo Convention" for SEO.', type: 'text', default: 'All American Tattoo Convention' },
      hero_tagline: { label: 'Hero tagline', type: 'text', default: 'Home of the Free, Because of the Brave' },
      hero_subtitle: { label: 'Hero subtitle', type: 'text', default: 'Where Top Tattoo Talent Meets Our Nation’s Heroes' },
      countdown_heading: { label: 'Countdown heading', type: 'text', default: 'Doors Open In' },

      // ── Primary CTA pair ──
      cta_booth: { label: 'CTA - Apply for a Booth', type: 'text', default: 'Apply for a Booth' },
      cta_tickets: { label: 'CTA - Get Your Tickets', type: 'text', default: 'Get Your Tickets' },
      ticket_sales_live: {
        label: 'Ticket sales are live',
        help: 'Off = the tickets button renders greyed out with the note below. On = it links to the ticket URL. No redeploy needed.',
        type: 'boolean',
        default: 'false',
      },
      ticket_url: {
        label: 'Ticket URL',
        help: 'Ticketmaster link. Only used when "Ticket sales are live" is on.',
        type: 'url',
        default: '',
      },
      ticket_pending_note: { label: 'Tickets-not-yet-live note', type: 'text', default: 'Tickets on sale October 2026' },

      // ── Intro ──
      intro_title: { label: 'Intro title', type: 'text', default: 'The All American Tattoo Convention' },
      intro_body: {
        label: 'Intro body',
        type: 'markdown',
        default:
          'The All American Tattoo Convention brings more than 300 of the best tattoo artists in the world to Fayetteville, North Carolina - home of Fort Bragg and the heart of America’s airborne and special operations community. For one unforgettable weekend every spring, the Crown Complex fills with world-class tattooing, live contests, entertainment, vendors, food trucks, and a community that exists nowhere else in the tattoo industry.\n\nOur mission is simple: give some of the bravest heroes in the world the opportunity to be tattooed by some of the best artists in the industry. Whether you’re active duty, a veteran, a military family member, or a tattoo collector traveling in for the weekend, there’s a place for you on our show floor.',
      },

      // ── Stats band ──
      stats_band: {
        label: 'Stats band',
        help: 'Separate each stat with a · character.',
        type: 'text',
        default: '300+ Artists · 3 Days · Thousands of Attendees · 10th Annual Pin-Up Contest · Kids Under 16 Free',
      },

      // ── Promo video ──
      video_heading: { label: 'Video section heading', type: 'text', default: 'See It For Yourself' },
      video_body: {
        label: 'Video section body',
        type: 'markdown',
        default: 'Three days of world-class tattooing, live contests and entertainment - and a crowd you will not find at any other convention. This is what the floor looks like.',
      },
      video_cta: { label: 'Video section CTA label', type: 'text', default: 'See the Full Schedule' },

      // ── Events ──
      events_title: { label: 'Events section title', type: 'text', default: 'What Happens at AATC' },
      events_empty: { label: 'Events "announced soon" copy', type: 'markdown', default: 'The full 2027 schedule of events is being finalized now - check back soon, or follow us for announcements as they drop.' },

      // ── Seminars & panels ──
      panels_title: { label: 'Seminars section title', type: 'text', default: 'Seminars & Panels' },
      panels_empty: { label: 'Seminars "announced soon" copy', type: 'markdown', default: 'The 2027 seminar and panel lineup will be announced soon. Past sessions have covered black & grey technique, the art of the consult, and color theory in tattooing.' },

      // ── Sponsors ──
      sponsors_title: { label: 'Sponsors section title', type: 'text', default: 'Thank You to Our Sponsors' },
      sponsors_cta_body: { label: 'Sponsors CTA body', type: 'text', default: 'Put your brand in front of thousands of tattoo enthusiasts, artists, and military supporters.' },
      sponsors_cta_button: { label: 'Sponsors CTA button', type: 'text', default: 'Become a Sponsor' },

      // ── After party ──
      afterparty_title: { label: 'After party section title', type: 'text', default: 'The After Parties' },
      afterparty_intro: {
        label: 'After party intro',
        type: 'markdown',
        default: 'The show doesn’t stop when the doors close. Official AATC after parties run every night of the show at venues around Fayetteville, starting with a kickoff the night before doors open.',
      },
      afterparty_note: { label: 'After party note', type: 'text', default: 'The three after parties are 21+ · Valid ID required at the door' },

      // ── Fayetteville / Fort Bragg ──
      local_title: { label: 'Fayetteville section title', type: 'text', default: 'Fayetteville & Fort Bragg' },
      local_body: {
        label: 'Fayetteville section body',
        type: 'markdown',
        default:
          'Fayetteville, North Carolina is home to Fort Bragg - the largest military installation in the world by population, and the heart of America’s airborne and special operations community. With more than 50,000 active-duty soldiers and tens of thousands of veterans and military families in the region, there is no better place for a convention that honors the bond between tattoo culture and military service.\n\nTattoos and the US armed forces share a history dating back to the early 1900s. For millions of Americans who have served, ink is a record of loyalty - to a branch, a unit, a country, and to brothers and sisters in arms, including those who never made it home.',
      },
      local_stay_title: { label: 'Where to stay title', type: 'text', default: 'Where to Stay' },
      local_stay_body: {
        label: 'Where to stay body',
        type: 'markdown',
        default:
          'Most AATC travelers go the Airbnb or short-term rental route - Fayetteville has plenty of affordable rentals within 10-15 minutes of the Crown Complex, and it’s the best option for artist crews sharing a place for the weekend. Hotels near the venue and along Skibo Rd are solid backups; book early, because convention weekend fills the area up.',
      },
      local_discounts_title: { label: 'Discounts title', type: 'text', default: 'Military & Veteran Discounts' },
      local_discounts_body: {
        label: 'Discounts body',
        type: 'markdown',
        default: '**$5 off** all ticket types for active military and veterans with valid ID. Veteran artists and vendors save **$150** on any booth with a veteran tattooing or vending in it.',
      },

      // ── Vendor login ──
      login_title: { label: 'Artist & vendor login title', type: 'text', default: 'Artist & Vendor Login' },
      login_body: { label: 'Artist & vendor login body', type: 'text', default: 'Manage your profile, booth details, and documents year-round.' },
      login_button: { label: 'Login button label', type: 'text', default: 'Sign In to Your Portal' },
    },
  },
  {
    // Renamed from 'home' by migration 045. 'home' read as the homepage and
    // sat directly beside 'homepage', which is the real one - two keys one
    // letter apart, pointing at different pages. See 045 for the data move.
    key: 'applyHub',
    title: 'Apply Hub (/apply)',
    sections: {
      hero_eyebrow: { label: 'Hero eyebrow', type: 'text', default: 'Applications Are Open' },
      hero_title: { label: 'Hero title', type: 'text', default: 'Applications Are Open for' },
      hero_title_accent: { label: 'Hero title (gold accent)', type: 'text', default: 'AATC 2027' },
      hero_intro: {
        label: 'Hero intro',
        type: 'markdown',
        default:
          'Everything you can apply for at the All American Tattoo Convention lives on this page. Booth applications are reviewed by our team; contest signups are first come, first served. Applications are open now - no pre-registration required.',
      },
      event_dates: { label: 'Event dates', type: 'text', default: 'April 16-18, 2027' },
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
        default: 'Artists, vendors, and food trucks - this is your home for AATC 2027.',
      },
      booth_block_body: {
        label: 'Booth block body',
        type: 'markdown',
        default:
          'Submit your application, our team reviews it, and approved applicants receive an invoice and booth assignment by email. Pay online through your exhibitor portal to lock in your spot. No payment is required to apply.',
      },
      cta_artist: { label: 'CTA - Artist button', type: 'text', default: 'Artist Booth Application' },
      cta_vendor: { label: 'CTA - Vendor button', type: 'text', default: 'Vendor Booth Application' },
      cta_food_truck: { label: 'CTA - Food truck button', type: 'text', default: 'Food Truck Application' },
      cta_sponsor: { label: 'CTA - Sponsor button', type: 'text', default: 'Become A Sponsor' },

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
          'The 10th annual Miss All American Pin-Up Contest takes the main stage Saturday afternoon. Entries are limited - sign up early. You must hold a Saturday ticket to participate.',
      },
      pinup_cta: { label: 'Pin-Up card link label', type: 'text', default: 'Enter the Pin-Up Contest' },

      contests_title: { label: 'Tattoo contests card title', type: 'text', default: 'Tattoo Contests' },
      contests_body: {
        label: 'Tattoo contests card body',
        type: 'markdown',
        default:
          'Tattoo contest registration is **on-site only** - sign up at the registration desk on the show floor, opening at 1:00 PM daily. No online entry, so plan to arrive early on contest days.',
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
          "Want to be part of the crew that makes this show happen? We're accepting volunteer applications for 2027. Spots are limited and competitive - tell us who you are and how you'd like to help.",
      },
      volunteer_cta: { label: 'Volunteer card link label', type: 'text', default: 'Apply to Volunteer' },

      // ── Deadline strip ──
      deadline_title: { label: 'Deadline strip title', type: 'text', default: 'Deadline: March 15, 2027 - or until sold out.' },
      deadline_body: {
        label: 'Deadline strip body',
        type: 'markdown',
        default:
          'Booth applications, Pin-Up Contest entries, and Wall of Honor submissions all close March 15, 2027, but booths and Pin-Up spots close early when they’re gone. Every year they go before the deadline - apply early.',
      },

      footer_name: { label: 'Footer name', type: 'text', default: 'ALL AMERICAN TATTOO CONVENTION' },
      footer_location: { label: 'Footer location', type: 'text', default: 'Crown Complex Event Center · Fayetteville, NC' },
    },
  },
  {
    key: 'tickets',
    title: 'Tickets (/tickets)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'April 16-18, 2027 · Fayetteville, NC' },
      header_title: { label: 'Header title', type: 'text', default: 'Get Your Tickets to AATC 2027' },
      header_intro: {
        label: 'Header intro',
        type: 'markdown',
        default:
          '**Kids under 16 get in FREE.** $5 military discount available on all pass types. All passes sold through Ticketmaster - **2027 tickets go on sale in October 2026** at 2026 pricing.',
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
          '- **Do I need a ticket to get tattooed?** Yes - admission is separate from your tattoo appointment.\n- **Kids under 16 are free.**\n- Contestants in the Miss All American Pin-Up Contest must hold a Saturday ticket.\n- The food truck rodeo out front is free and open to the public - no ticket required.',
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
          'Every trophy-winning tattoo from the show - first, second and third place in each category - is posted here for voting after the weekend ends. Voting is free, and needs a quick account so each person votes once per category per day. ' +
          COLLECTORS_CHOICE_PRIZE,
      },
      vote_hint: { label: 'Per-category vote hint', type: 'text', default: 'Tap a photo to enlarge · Select your favorite to vote' },
      // THREE STATES, not one. A visitor arriving in June needs a different
      // sentence from one arriving in March, and 'Voting opens soon' is wrong
      // for both once the window has passed. The state comes from
      // events.voting_opens_at / voting_closes_at via voting_state(), so it is
      // driven by the configured window rather than by whether entries exist.
      before_title: { label: 'Before voting opens: title', type: 'text', default: 'Voting opens after the convention' },
      before_body: {
        label: 'Before voting opens: body',
        type: 'markdown',
        default: 'Trophy winners are posted once the show is over, and voting runs for 30 days from Wednesday 21 April 2027.',
      },
      closed_title: { label: 'After voting closes: title', type: 'text', default: 'Voting has closed' },
      closed_body: {
        label: 'After voting closes: body',
        type: 'markdown',
        default: 'Thanks to everyone who voted. The Collector\u2019s Choice winner will be announced by AATC.',
      },
      empty_title: { label: 'Voting open, nothing posted yet: title', type: 'text', default: 'Winners are being posted' },
      empty_body: {
        label: 'Empty-state body',
        type: 'markdown',
        default: 'Trophy winners from each category are going up now. Check back shortly to cast your votes.',
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
    key: 'kidsContest',
    title: 'Kids Temp Tattoo Contest (/events/kids-contest)',
    sections: {
      hero_kicker: { label: 'Hero kicker', type: 'text', default: 'Sunday on the Main Stage' },
      hero_title: { label: 'Hero title (H1)', type: 'text', default: 'Kids Temp Tattoo Contest' },
      hero_intro: {
        label: 'Hero intro',
        type: 'markdown',
        default:
          'The one contest at AATC open to under-18s. Kids show off a temporary tattoo on the main stage on Sunday, judged the same way every other category is - and it is **free to enter**.',
      },
      // NO CLOCK TIME, and that is the accurate answer rather than a missing
      // one. Ryan confirmed how contests actually run: categories go
      // concurrently rather than in fixed slots, each runs until its winner is
      // announced, and the announcer calls them live from the main stage. So
      // there is no time to publish and there will not be one.
      //
      // Saying nothing about timing would read as information the visitor
      // failed to find, and they would go looking for a schedule that does not
      // exist. Describing how it works is the honest version.
      //
      // Do NOT reintroduce the 4:00 PM judging start here. It is real, and it
      // applies to the contest block as a whole - attaching it to this category
      // would be the sixth wrong time claim on this page family.
      when_note: {
        label: 'When it happens',
        help: 'There is deliberately no clock time. Categories run concurrently and are called live. Do not add one.',
        type: 'markdown',
        default:
          'Contest categories run throughout the day rather than at fixed times, and the announcer calls each one from the main stage. The Kids Temporary Tattoo Contest usually runs shortly before the Tattoo Battle winner is announced. Listen for it, or ask at the contest table.',
      },
      how_to_enter: {
        label: 'How to enter',
        type: 'markdown',
        default:
          'Register at the contest booth near the main stage on Sunday. Entry is free, and no advance sign-up is needed. Bring the child and their temporary tattoo - anything goes, as long as it is not permanent.',
      },
      gallery_title: { label: 'Gallery heading', type: 'text', default: 'From Previous Years' },
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
  {
    key: 'about',
    title: 'About AATC',
    sections: {
      // ── Header ──
      hero_kicker: { label: 'Header kicker', type: 'text', default: 'Our Mission' },
      hero_title: { label: 'Header title', type: 'text', default: 'About AATC' },
      hero_intro: {
        label: 'Header intro',
        type: 'markdown',
        default: 'The All American Tattoo Convention celebrates the intersection of tattoo culture and military service. Founded to honor our tattooed service members and veterans, AATC is more than a convention - it is a gathering of community, respect, and artistry.',
      },

      // ── What makes AATC different (four cards) ──
      different_title: { label: '"Different" section title', type: 'text', default: 'What Makes AATC Different' },
      diff_1_title: { label: 'Card 1 title', type: 'text', default: 'Military-Focused' },
      diff_1_body: { label: 'Card 1 body', type: 'markdown', default: 'Every aspect of AATC is designed with service members and veterans in mind, from discounted admission for active duty and veterans to dedicated programming that honors military culture.' },
      // FACTUAL CORRECTION carried over from the page (spec §3.1): AATC is not
      // veteran-owned - Ryan Harrell is not a veteran. What is true is that the
      // show platforms veteran-owned businesses. Do not reword this back toward
      // the original claim, in code or in the admin.
      diff_2_title: { label: 'Card 2 title', type: 'text', default: 'Highlighting Veteran-Owned & Operated Businesses' },
      diff_2_body: { label: 'Card 2 body', type: 'markdown', default: 'AATC gives veteran-owned shops and businesses a place at the front of the show, and the founding family has deep roots in the Fort Bragg community.' },
      diff_3_title: { label: 'Card 3 title', type: 'text', default: 'Supporting Veteran Causes' },
      diff_3_body: { label: 'Card 3 body', type: 'markdown', default: 'A portion of every ticket sold goes directly to veteran support organizations. Our Wall of Honor provides a space for remembrance and healing.' },
      diff_4_title: { label: 'Card 4 title', type: 'text', default: 'World-Class Artists' },
      diff_4_body: { label: 'Card 4 body', type: 'markdown', default: 'We bring together elite tattoo artists from across the country, many of whom are veterans themselves, creating an unmatched experience for collectors.' },

      // ── Our story (multi-paragraph: separate paragraphs with a blank line) ──
      story_title: { label: 'Story section title', type: 'text', default: 'Our Story' },
      story_subtitle: { label: 'Story subtitle', type: 'text', default: 'From a bold idea to a movement' },
      story_body: {
        label: 'Story body',
        help: 'Long-form. Separate paragraphs with a blank line.',
        type: 'markdown',
        default:
          'The All American Tattoo Convention was founded in 2025 with a clear purpose: to create a tattoo event that genuinely reflects the values, culture, and camaraderie of military life. What began as a vision shared among a small group of veterans and tattoo artists has grown into one of the most anticipated tattoo events in the Southeast.\n\nFrom its inaugural year, AATC has drawn thousands of attendees, hundreds of elite tattoo artists, and widespread support from veteran organizations across the country. The convention has raised funds for veteran mental health programs, supported Gold Star families, and provided a platform for service members to share their stories through ink.\n\nAs we prepare for our 2027 convention, AATC continues to grow - not just in size, but in impact. Every year, we deepen our commitment to the military community and push the boundaries of what a tattoo convention can be.',
      },

      // ── Why Fayetteville (multi-paragraph) ──
      fayetteville_title: { label: 'Fayetteville section title', type: 'text', default: 'Why Fayetteville?' },
      fayetteville_subtitle: { label: 'Fayetteville subtitle', type: 'text', default: 'The heart of the military community' },
      fayetteville_body: {
        label: 'Fayetteville body',
        help: 'Long-form. Separate paragraphs with a blank line.',
        type: 'markdown',
        default:
          'Fayetteville, North Carolina is home to Fort Bragg - the largest military installation in the world by population. With over 50,000 active-duty soldiers and tens of thousands of veterans and military families calling the region home, there is no better place for a convention that honors the bond between tattoo culture and military service.\n\nThe city\'s deep connection to the military runs through every neighborhood, business, and community organization. Fayetteville understands service, sacrifice, and the pride that comes with wearing your story on your skin. The Crown Complex Event Center provides a world-class venue just minutes from post, making it accessible to the massive military population in the region.\n\nBeyond the military connection, Fayetteville offers a thriving local tattoo scene, Southern hospitality, and easy access from major cities along the East Coast. It is, quite simply, where AATC belongs.',
      },

      // ── Gallery + footer CTA ──
      gallery_title: { label: 'Gallery title', type: 'text', default: 'Around the Convention' },
      cta_title: { label: 'Footer CTA title', type: 'text', default: 'Want to learn more?' },
      cta_lead: { label: 'Footer CTA lead-in (the email address follows it automatically)', type: 'text', default: 'Contact us at' },
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
