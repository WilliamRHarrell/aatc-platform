import Link from 'next/link'
import Image from 'next/image'
import type { BattleEntry } from '@/lib/tattoo-battle-data'
import { entryAlt, entryPath, mediaPublicUrl } from '@/lib/tattoo-battle'

export default function EntryCard({ entry }: { entry: BattleEntry }) {
  const first = entry.media[0]
  const thumb = first
    ? first.type === 'image' ? mediaPublicUrl(first.path) : first.poster_path ? mediaPublicUrl(first.poster_path) : null
    : null
  return (
    <Link href={entryPath(entry.bucket_number)} className="group flex flex-col overflow-hidden rounded-2xl border transition-colors hover:border-[#8B7355]"
          style={{ backgroundColor: '#1a1a1a', borderColor: entry.is_champion ? '#C4A882' : '#2a2a2a' }}>
      <div className="relative aspect-square bg-black">
        {thumb ? (
          <Image src={thumb} alt={entryAlt(entry.bucket_number, entry.artist_name)} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center font-battle-condensed text-sm uppercase" style={{ color: '#999' }}>Video</div>
        )}
        <span className="absolute left-2 top-2 rounded-md px-2 py-1 font-battle-display text-lg text-black" style={{ backgroundColor: '#C4A882' }}>
          #{entry.bucket_number}
        </span>
        {entry.is_champion && (
          <span className="absolute right-2 top-2 rounded-md px-2 py-1 font-battle-condensed text-xs font-bold uppercase tracking-wider text-black" style={{ backgroundColor: '#C4A882' }}>
            Champion
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-battle-slab text-base text-white">{entry.artist_name}</p>
        {entry.shop_name && <p className="text-xs" style={{ color: '#999' }}>{entry.shop_name}</p>}
      </div>
    </Link>
  )
}
