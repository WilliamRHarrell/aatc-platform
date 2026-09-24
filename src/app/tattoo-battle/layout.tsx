import type { ReactNode } from 'react'
import { Rubik_Dirt, Rye, Oswald } from 'next/font/google'

// Battle-only faces, loaded for this segment so the rest of the site does not
// pay for them. globals.css maps them onto the font-battle-* tokens.
const rubikDirt = Rubik_Dirt({ weight: '400', subsets: ['latin'], variable: '--font-rubik-dirt', display: 'swap' })
const rye = Rye({ weight: '400', subsets: ['latin'], variable: '--font-rye', display: 'swap' })
const oswald = Oswald({ weight: ['500', '700'], subsets: ['latin'], variable: '--font-oswald', display: 'swap' })

export default function TattooBattleLayout({ children }: { children: ReactNode }) {
  return <div className={`${rubikDirt.variable} ${rye.variable} ${oswald.variable}`}>{children}</div>
}
