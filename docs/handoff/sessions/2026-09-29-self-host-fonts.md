# Session 2026-09-29: self-host Inter, Playfair Display, Rubik Dirt, Rye (branch fix/self-host-fonts)

A local build on 2026-09-29 (the #53 sitemap branch) failed while fetching
fonts.gstatic.com. `next/font/google` downloads fonts at build time, and it
had already broken a Vercel build once (Oswald, fixed in #44). Every font is
now a local woff2 loaded with `next/font/local`, following the #44 pattern:
- `src/fonts/site.ts`: Inter (variable, weights 100-900) and Playfair Display
  (variable, weights 400-900), used by the root layout. The CSS variables
  --font-inter and --font-playfair are unchanged.
- `src/fonts/battle.ts`: Rubik Dirt and Rye (weight 400), used by the
  /tattoo-battle layout and the admin print page. --font-rubik-dirt and
  --font-rye are unchanged.
- Latin subset only, like Oswald. Downloaded 2026-09-29 from Google Fonts'
  css2 API (the latin @font-face files). The OFL licence for each font sits
  next to its file.

Checks: `npm run build` passes, and the build output and .next/static contain
no fonts.gstatic.com reference. In headless Chrome, `/` loads inter, playfair
and oswaldSite, and `/tattoo-battle` also loads rubikDirt, rye and
oswaldBattle. `src/lib/fonts.test.ts` fails on any `next/font/google` import
or a missing licence. `npm test` passes 208/208.
