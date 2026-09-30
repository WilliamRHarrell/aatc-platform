import localFont from 'next/font/local'

/**
 * Tattoo Battle faces, SELF-HOSTED (latin subset, weight 400 only; licences
 * OFL-Rubik-Dirt.txt, OFL-Rye.txt beside them). Loaded by /tattoo-battle and
 * the admin print page only. Were next/font/google; see site.ts for why.
 */
export const rubikDirt = localFont({
  src: './rubik-dirt-latin-400.woff2',
  weight: '400',
  variable: '--font-rubik-dirt',
  display: 'swap',
})

export const rye = localFont({
  src: './rye-latin-400.woff2',
  weight: '400',
  variable: '--font-rye',
  display: 'swap',
})
