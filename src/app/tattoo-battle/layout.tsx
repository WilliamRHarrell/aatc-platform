import type { ReactNode } from 'react'
import { rubikDirt, rye } from '@/fonts/battle'
import { oswaldBattle as oswald } from '@/fonts/oswald'

// Battle-only faces, loaded for this segment so the rest of the site does not
// pay for them. globals.css maps them onto the font-battle-* tokens.
export default function TattooBattleLayout({ children }: { children: ReactNode }) {
  return <div className={`${rubikDirt.variable} ${rye.variable} ${oswald.variable}`}>{children}</div>
}
