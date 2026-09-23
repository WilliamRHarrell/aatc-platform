import Link from 'next/link'
import type { BattleEntry } from '@/lib/tattoo-battle-data'
import { entryPath } from '@/lib/tattoo-battle'
import { EVENT_YEAR } from '@/lib/event-config'

export default function ChampionBanner({ entry }: { entry: BattleEntry }) {
  return (
    <div className="border-b px-4 py-4 text-center" style={{ backgroundColor: 'rgba(196,168,130,0.12)', borderColor: '#8B7355' }}>
      <p className="font-battle-condensed text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#C4A882' }}>{EVENT_YEAR} Champion</p>
      <p className="mt-1 font-battle-display text-2xl uppercase text-white sm:text-3xl">{entry.artist_name}</p>
      {entry.shop_name && <p className="text-sm" style={{ color: '#999' }}>{entry.shop_name}</p>}
      <Link href={entryPath(entry.bucket_number)} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>
        See the winning tattoo (Bucket #{entry.bucket_number})
      </Link>
    </div>
  )
}
