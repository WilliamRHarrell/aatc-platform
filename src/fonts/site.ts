import localFont from 'next/font/local'

/**
 * Inter and Playfair Display, SELF-HOSTED (latin subset; licences
 * OFL-Inter.txt, OFL-Playfair-Display.txt beside them). Both are variable
 * fonts, so one file covers every weight, the same as next/font/google served.
 *
 * Were next/font/google. That loader fetches from fonts.gstatic.com at build
 * time, and on 2026-09-29 a local build failed on a timeout there, the same
 * kind of build-time dependency that took out Oswald (see oswald.ts). A local
 * file has no build-time fetch.
 */
export const inter = localFont({
  src: './inter-latin-variable.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

export const playfair = localFont({
  src: './playfair-display-latin-variable.woff2',
  weight: '400 900',
  variable: '--font-playfair',
  display: 'swap',
})
