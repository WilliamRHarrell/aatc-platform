# Session 2026-09-28: new site footer, page-bottom order, newsletter to GHL

**Delivered.** Branch `feat/site-footer`. No migration. Design handoff
committed at `docs/design/site-footer/` (from Ryan's checkout).

## Order on every public page (root layout; never /admin)
Page content, then the EXISTING sponsor section (`FooterSponsors`, unchanged:
same markup, same admin `featured_footer` flag), then the new footer. The old
footer block (social icons, phone/gmail line) is gone. Done once in
`src/app/layout.tsx` inside `PublicBottom` (hides both on /admin), so it
applies to every non-admin route, including /portal, /auth and the Tattoo
Battle QR pages (Ryan: keep the footer there). No page had its own footer.

## Footer (`src/components/SiteFooter.tsx`, server component)
- Background = the header's (`bg-background`, #0a0a0a), gold top rule. No flag.
- Brand: `public/images/footer/aatc-secondary-logo.png` (links home; capped at
  280px wide when it takes a full row below 1000px), "Crown Complex /
  Fayetteville / Fort Bragg, NC", gold Buy Tickets -> /tickets.
- Four nav columns (Ryan's list), routes from `src/lib/routes.ts`, which the
  header now uses too. Contact dropped (no page; the contact line covers it).
- Portal card -> /auth/login?redirect=/portal (new tab). Star divider, the
  site's own social/phone/mail SVGs, CONTACT_PHONE and CONTACT_EMAIL.
- Responsive: 6-column band at >=1000px; brand and newsletter full rows with
  the nav in one row of 4 (2x2 under 760px, where four caps columns don't
  fit); single column under 600px with the form stacked.
- Tokens added to `globals.css`: gold-antique (#9c8446 / hover #b59d5e /
  press #7a683a), text-body #f2efe6, text-muted #b9bdbe, line-gold, tracking
  caps/spread, font-condensed (Oswald 300/400/600/700 via next/font in the
  root layout). No inline hex in the footer.
- Two fits for the six-column band (checked in a real browser at 1280 and
  1100px): Buy Tickets fills the brand column (it wrapped otherwise), and the
  newsletter input/button join flush only when their column is >=320px wide
  (container query); narrower, they stack, so "EMAIL ADDRESS" is never cut.

## Verified (local production build, headless Chrome, 2026-09-28)
- Order in the live DOM: page content, sponsor section, footer (1280, 1100,
  900, 700, 390px); no horizontal overflow at any of them; footer background
  rgb(10,10,10) = header; Oswald applied.
- /api/newsletter without GHL env: 503 "not available right now", shown
  inline under the field; invalid email 400; honeypot and <2s submit 400,
  both logged. The GHL calls themselves are covered by tests only (mocked
  fetch) until the Vercel env vars exist.

## Header
Event Schedule first in Events; Booth Applications -> /apply; "Become A
Sponsor" relabelled "Sponsorship Packages" (/sponsors/packages).

## Removed
- Homepage section 10 (Artist & Vendor Login card) and its registry keys
  `login_title`, `login_body`, `login_button` (no page_content rows existed).
- The gmail address (only in the old SiteFooter; none in DB content).
- Mailchimp: nothing in code or local env; `scripts/check-email-dns.mjs` still
  looks for Mailchimp DNS as a sender hint (diagnostic, kept). Ryan removes
  any MAILCHIMP_* in Vercel.

## SOCIAL (event-config) changed
`SOCIAL.instagram` / `SOCIAL.tiktok` said /officialaatc but nothing used them;
the live footer linked /allamericantattooconvention and @theaatc (the handoff
agrees). SOCIAL now holds the footer's URLs and the footer reads it.

## Newsletter -> GHL
`POST /api/newsletter` (bot trap + email check) -> `src/lib/ghl.ts`: upsert
{locationId, email, source "website footer"} WITHOUT tags (upsert tags replace
all existing ones), then POST /contacts/{id}/tags ["newsletter"]. Env
GHL_API_TOKEN (Private Integration, `contacts.write` only) and GHL_LOCATION_ID;
missing -> 503 with a clear message. Version header `2021-07-28`: confirm on
the first live signup (GHL's docs show both that and `v3`). Added to the
rate-limit open item.
