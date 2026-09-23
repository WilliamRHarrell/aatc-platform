'use client'

import Link from 'next/link'
import Countdown from '@/components/home/Countdown'
import { BATTLE_START, BATTLE_DURATION_HOURS } from '@/lib/tattoo-battle-config'
import { judgingIso } from '@/lib/tattoo-battle'
import { SHOW_CLOSE_ISO, EVENT_YEAR } from '@/lib/event-config'

/**
 * Counts down to the stencil reveal. During the show it says the battle is on;
 * after the show closes it wraps. Between judging and Sunday it keeps saying
 * "on" - the buckets are out and that IS the battle, all weekend.
 */
export default function BattleCountdown() {
  void judgingIso(BATTLE_START, BATTLE_DURATION_HOURS) // asserts the config parses at module load
  return (
    <Countdown
      target={BATTLE_START}
      close={SHOW_CLOSE_ISO}
      during={
        <div className="text-center">
          <p className="font-battle-display text-3xl uppercase tracking-wide sm:text-4xl" style={{ color: '#C4A882' }}>
            The Battle is on
          </p>
          <Link href="/events/schedule" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4" style={{ color: '#C4A882' }}>
            See the weekend schedule
          </Link>
        </div>
      }
      after={
        <p className="font-battle-display text-2xl uppercase sm:text-3xl" style={{ color: '#C4A882' }}>
          That is a wrap on the {EVENT_YEAR} Battle
        </p>
      }
    />
  )
}
