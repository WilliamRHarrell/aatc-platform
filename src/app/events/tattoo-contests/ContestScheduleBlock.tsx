import Link from 'next/link'
import Markdown from '@/components/Markdown'
import { ROUTES } from '@/lib/routes'
import type { ContestSchedule, DayTime } from '@/lib/contest-schedule'

/**
 * "Daily Contest Schedule" on /events/tattoo-contests. Server-rendered and
 * passed into the client page as a slot. Copy from the page-content registry
 * (tattooContests); every time from the schedule rows (lib/contest-schedule.ts).
 * A line whose row is missing is left out, never filled with a typed time.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-right text-xs font-medium" style={{ color: '#C4A882' }}>{label}</span>
      <span className="text-xs" style={{ color: '#999' }}>{children}</span>
    </div>
  )
}

const list = (xs: DayTime[]) => xs.map(x => `${x.day} ${x.time}`).join(' · ')

export default function ContestScheduleBlock({ schedule, copy }: { schedule: ContestSchedule; copy: Record<string, string> }) {
  const s = schedule
  const hasTimed = s.tattooOfTheDay.length > 0 || s.bestInShow.length > 0 || s.battleStart || s.battleChampion
  return (
    <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <h3 className="mb-3 text-sm font-bold text-white">{copy.schedule_heading}</h3>
      <div className="mb-4 text-xs leading-relaxed [&_p]:m-0" style={{ color: '#999' }}>
        <Markdown>{copy.schedule_format}</Markdown>
      </div>

      {s.days.length > 0 && (
        <div className="space-y-2">
          {s.days.map(d => (
            <Row key={d.day} label={d.day}>
              {[
                d.registration && `Registration ${d.registration}`,
                d.begins && `Contests begin ${d.begins}`,
                d.resumes && `Judging resumes ${d.resumes}`,
              ].filter(Boolean).join(' · ')}
            </Row>
          ))}
        </div>
      )}

      {hasTimed && (
        <>
          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#8B7355' }}>{copy.timed_heading}</h4>
          <div className="space-y-2">
            {s.tattooOfTheDay.length > 0 && <Row label="Tattoo of the Day">{list(s.tattooOfTheDay)}</Row>}
            {s.bestInShow.length > 0 && <Row label="Best in Show">{list(s.bestInShow)}</Row>}
            {(s.battleStart || s.battleChampion) && (
              <Row label="Tattoo Battle">
                {[
                  s.battleStart && `Starts ${s.battleStart.day} ${s.battleStart.time}`,
                  s.battleChampion && `Champion crowned ${s.battleChampion.day} ${s.battleChampion.time}`,
                ].filter(Boolean).join(' · ')}
                {' · '}
                <Link href={ROUTES.tattooBattle} className="underline underline-offset-2 hover:text-white" style={{ color: '#C4A882' }}>
                  {copy.battle_link}
                </Link>
              </Row>
            )}
          </div>
        </>
      )}
    </div>
  )
}
