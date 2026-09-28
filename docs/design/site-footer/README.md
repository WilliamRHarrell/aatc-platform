# Handoff: AATC Global Site Footer

## Overview
A global footer for every page of allamericantattooconvention.com. It replaces the current footer (the Artist & Vendor Login card, social icons and contact line) with a fuller one that adds main-navigation link columns, a newsletter signup and the secondary logo, all styled to the AATC brand: black, antique gold and white, square corners, and condensed all-caps type.

## About the design files
The files in `reference/` are **design references built in HTML/React**: prototypes that show the intended look and behavior. They are not production code to paste in. The task is to **recreate this footer in the website's existing stack** (its framework, CSS approach and component patterns). If the site already has a footer component, replace or restyle that component rather than adding a second one. Open `reference/preview.html` through a local server (for example `npx serve design_handoff_site_footer`) to see it running.

## Fidelity
**High-fidelity.** Colors, type, spacing and interactions are final. Match them exactly.

## Layout
`<footer>` spans the full width.
- Background `#0b0b09`, with a 1px top border in `rgba(156,132,70,.4)`.
- `assets/aatc-bg-flag.png` sits behind all footer content as a ghosted background: absolutely positioned to cover the whole footer, `object-fit: cover`, opacity 0.12, `pointer-events: none`.

The inner container is max-width 1200px, centered, with padding `64px 48px 32px`. Its children are stacked in a flex column with a 48px gap:

1. **Main band.** A CSS grid with columns `1.1fr 1fr 1fr 1fr 1.6fr` and a 40px gap:
   - Brand block
   - Three nav columns
   - Newsletter
2. **Artist & Vendor Login card** (full width).
3. **Star divider.**
4. **Bottom block.** Centered, stacked in a column with a 20px gap:
   - Social icons
   - Contact line
   - Copyright

**Responsive (not mocked; suggested):**
- Below ~1000px: brand block and newsletter each take the full row; the three nav columns share one row.
- Below ~600px: everything becomes a single column, padding `48px 24px 24px`, and the newsletter input and button stack vertically.

## Components

### Brand block
Flex column, 16px gap.
- **Logo:** `assets/aatc-secondary-logo.png`, a transparent PNG with white and gold artwork on a transparent background.
  - Width is 100% of the column, height auto, `display: block`. It should fill the column.
  - Alt text: "The All American Tattoo Convention".
- **Address:** "CROWN COMPLEX" / "FAYETTEVILLE / FORT BRAGG, NC" on two lines.
  - Oswald 12px, uppercase, letter-spacing 0.14em, line-height 1.6.
  - Color `#b9bdbe`.

### Nav columns (×3)
Flex column, 12px gap.
- **Heading:** Oswald 12px, weight 600, uppercase, letter-spacing 0.28em, color `#9c8446`.
- **Rule under the heading:** 24px wide, 1px solid `rgba(156,132,70,.4)`.
- **Links:** Oswald 14px, uppercase, letter-spacing 0.06em, color `#f2efe6`, no underline.
  - Hover: color changes to `#b59d5e`, with a 120ms ease-out transition.

The link names below are placeholders. Replace them with the site's real menu and URLs.

| Convention | Attend | Participate |
|---|---|---|
| Artists | Tickets | Vendors |
| Contests | Venue & Parking | Artist Booths |
| Tattoo Battle | Hotels | Sponsors |
| Schedule | FAQ | Contact |

### Newsletter
Flex column, 12px gap.
- **Heading and rule:** the same styles as the nav columns. Heading text: "NEWSLETTER".
- **Title:** "GET THE LINEUP FIRST". Oswald 20px, weight 700, uppercase, letter-spacing 0.14em, color `#ffffff`, line-height 1.15.
- **Copy:** "Artist announcements, contest news and ticket drops." Oswald 14px, weight 300, color `#b9bdbe`, line-height 1.5.
- **Form:** a flex row with the input and button joined flush (no gap between them). Square corners throughout.
  - **Input:**
    - `type="email"`, placeholder "EMAIL ADDRESS", `aria-label="Email address"`, flex 1.
    - Background `#1d1c1a`, text color `#f2efe6`.
    - Border 1px `rgba(156,132,70,.4)` on every side except the right, which has none.
    - Padding `12px 14px`. Oswald 14px, letter-spacing 0.06em.
    - Focus: border color `#b59d5e`, no outline.
  - **Button:** "SIGN UP", primary style (see Button below).
- **Success state:** the form is replaced by "★ YOU'RE ON THE LIST".
  - Oswald 14px, uppercase, letter-spacing 0.14em, color `#9c8446`.
  - 1px solid `#9c8446` border, padding `12px 14px`.

### Artist & Vendor Login card
- **Container:**
  - Flex row with `space-between`, items centered, 24px gap; wraps on narrow screens.
  - Background `#1d1c1a`, border 1px `rgba(156,132,70,.4)`, square corners.
  - Padding `24px 28px`.
- **Title:** "ARTIST & VENDOR LOGIN". Oswald 18px, weight 700, uppercase, letter-spacing 0.14em, color `#ffffff`.
- **Description:** "Manage your profile, booth details, and documents year-round." Oswald 14px, weight 300, color `#b9bdbe`. There is a 6px gap between the title and the description.
- **Button:** "SIGN IN TO YOUR PORTAL", outline style. It links to the existing portal URL.

### Star divider
A flex row with a 16px gap: a 1px `rgba(156,132,70,.4)` hairline on each side (flex 1), with "★ ★ ★ ★ ★" between them.
- Stars: color `#9c8446`, 12px, letter-spacing 10px.

### Social icons
Four tiles in a flex row with a 12px gap: Instagram, Facebook, TikTok, X.
- **Tile:**
  - 44×44px, square corners, 1px `rgba(156,132,70,.4)` border.
  - Centered glyph, 17px, color `#f2efe6`.
  - Hover: border changes to `#9c8446` and the glyph to `#b59d5e`, over 120ms.
- **Link attributes:** each tile is an `<a>` with `target="_blank"`, `rel="noreferrer"`, and an `aria-label` set to the platform name.
- **Icons:** Font Awesome 6 brand icons (`fa-instagram`, `fa-facebook-f`, `fa-tiktok`, `fa-x-twitter`). Use whatever icon library the site already has, as long as the glyphs match.

| Platform | URL |
|---|---|
| Instagram | https://instagram.com/allamericantattooconvention |
| Facebook | https://facebook.com/allamericantattooconvention |
| TikTok | https://tiktok.com/@theaatc |
| X | https://x.com/officialaatc |

### Contact line
A flex row, wrapping, centered, with a 24px gap.
- **Items:**
  - Phone: `(910) 850-2566`, linked as `tel:9108502566`.
  - Email: `allamericantattooconvention@gmail.com`, linked as `mailto:`.
- **Text:** Oswald 14px, letter-spacing 0.04em, color `#b9bdbe`, no underline.
- **Icons:** each item has a gold (`#9c8446`) 12px phone or envelope icon to its left, with an 8px gap.

### Copyright
"© {current year} THE ALL AMERICAN TATTOO CONVENTION · #AATCEAST"
- Oswald 11px, uppercase, letter-spacing 0.14em.
- Color `#b9bdbe` at 80% opacity.

### Button (used twice in the footer)
- **Base:**
  - Oswald 14px, weight 600, uppercase, letter-spacing 0.14em.
  - Padding `12px 28px`, square corners, 2px border.
  - 120ms ease-out transition.
- **Primary:**
  - Background and border `#9c8446`, text `#0b0b09`.
  - Hover: background and border change to `#b59d5e`.
- **Outline:**
  - Transparent background, 2px `#9c8446` border, text `#9c8446`.
  - Hover: text and border change to `#b59d5e`.
- **Press state:** darken to `#7a683a`. Do not use a scale or shrink effect.

## Interactions & behavior
- **Newsletter submit:**
  - Validate the email (for example `/.+@.+\..+/`). If it is invalid, do nothing, or show an inline error in `#b9bdbe` 12px caps under the field.
  - If it is valid, POST it to the site's email provider (Mailchimp, Klaviyo, etc.; confirm which with the site owner) and then show the success state.
  - Add a loading state while the request runs: disable the button and change its label to "SIGNING UP…".
- **Hover transitions:** all are 120ms ease-out. Nothing bounces or scales.
- **Social and portal links:** open in a new tab. Nav links open in the same tab.

## State
- `email`: string.
- `status`: `'idle' | 'submitting' | 'success' | 'error'`.

## Design tokens
| Token | Value |
|---|---|
| Ink black (page) | `#0b0b09` |
| Card surface | `#1d1c1a` |
| Antique gold | `#9c8446` |
| Gold (hover) | `#b59d5e` |
| Gold (press) | `#7a683a` |
| White | `#ffffff` |
| Off-white body text | `#f2efe6` |
| Silver muted text | `#b9bdbe` |
| Subtle border | `rgba(156,132,70,.4)` |
| Tracking: caps | 0.14em |
| Tracking: wide | 0.28em |
| Spacing scale | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px |
| Border radius | 0 everywhere |

The full token files are in `reference/tokens/`.

## Fonts
- **Oswald** (Google Fonts, weights 300–700) is used for everything in the footer. It currently stands in for the brand's condensed wood-type font. If the real font files are provided later, swap them in.
- **Barbaro** (`reference/fonts/barbaro-punta.ttf`) is the brand's display font. It is not used in the footer, but it is included so the site can use it for headings.

## Assets
- `assets/aatc-secondary-logo.png`: the secondary wordmark, used in the brand block.
- `assets/aatc-bg-flag.png`: the flag, ghosted behind the footer.
- Icons: Font Awesome 6 (CDN `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css`), or the site's existing icon set.

## Files
- `reference/SiteFooter.jsx.txt`: the footer's full reference implementation (React, inline styles). The `.txt` suffix keeps these files out of the design-system bundle; rename them to `.jsx` if you want to run them.
- `reference/Button.jsx.txt` and `reference/StarDivider.jsx.txt`: the sub-components it uses.
- `reference/tokens/*.css` and `reference/fonts/`: the brand tokens and fonts.
- `reference/preview.html`: a runnable preview; serve the folder locally to view it.
