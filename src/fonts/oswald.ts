import localFont from 'next/font/local'

/**
 * Oswald, SELF-HOSTED (one variable woff2, weights 200-700, latin subset;
 * licence: OFL-Oswald.txt beside it).
 *
 * Was next/font/google. On 2026-09-29 a Vercel preview build (PR #43) failed:
 * Google answered the Oswald CSS request with `fonts.gstatic.com/l/font?kit=...
 * &skey=...&v=...` URLs, which Turbopack's Google-font loader cannot resolve
 * ("next/font/google queries have exactly one entry"), so the whole build
 * died. It depends on what Google serves at build time, so it came and went.
 * A local file has no build-time fetch.
 *
 * Two instances of the same file because two CSS variables are in use:
 * --font-oswald-site (root layout, the site footer) and --font-oswald
 * (/tattoo-battle and its admin print page).
 */
export const oswaldSite = localFont({
  src: './oswald-latin-variable.woff2',
  weight: '200 700',
  variable: '--font-oswald-site',
  display: 'swap',
})

export const oswaldBattle = localFont({
  src: './oswald-latin-variable.woff2',
  weight: '200 700',
  variable: '--font-oswald',
  display: 'swap',
})
