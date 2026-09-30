# Session 2026-09-29: Tattoo Dating Game logo (branch content/dating-game-logo)

- The file copied is Ryan's `~/Downloads/tattoo-dating-game-logo-website.png`
  (623,278 bytes, modified 2026-09-29 22:27, 1467x989 transparent PNG, gold
  lettering). It is now `public/images/tattoo-dating-game/logo.png`, byte for
  byte (checked with cmp).
- `ASSETS.tattooDatingGameLogo` in event-config is its one home.
- The /events/dating-game header now works like /events/pinup-contest: a
  `next/image` logo with alt="" and aria-hidden, the same sizes and classes
  (w-4/5, max 420px), and a screen-reader-only h1 "The Tattoo Dating Game".
  That replaces the visible "Tattoo Dating Game" heading. The tagline and
  intro are unchanged and follow the logo.
- It is served through the image pipeline (/_next/image, WebP): about 58 KB
  at the 828px width the page requests on a 2x phone, versus the 623 KB PNG.

Checks: `npm run build` passes. In headless Chrome the logo loads from
/_next/image, it is 420px wide on desktop, and the page has exactly one h1.
The page passes the render check, and at 390px it matches the pinup header.

Seen, not changed: this page types its time ("Saturday, April 17 at 6:00
PM") by hand. The homepage card reads it from schedule_items (#41).
