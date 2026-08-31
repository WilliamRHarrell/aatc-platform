import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

/**
 * The team section on /info/about. SERVER rendered, reads team_members.
 *
 * WHY THIS TABLE EXISTS IN THE SHAPE IT DOES, carried from the hardcoded array
 * it replaces so the reasoning does not get separated from the code:
 *
 * Three of the four people previously listed here DID NOT EXIST. Sarah
 * Mitchell, Marcus Thompson and Jessica Rivera were placeholder copy shipped to
 * a live page as named staff with invented biographies, including "Veteran
 * advocate" and "Tattoo industry veteran". They were removed rather than
 * reworded. A fabricated head of Veterans Outreach on a page aimed at Gold Star
 * families is that mistake with the most at stake.
 *
 * Ryan's bio also claimed he is an Army veteran. HE IS NOT. It was corrected -
 * see migration 059, which seeds the corrected wording verbatim. Do not reword
 * either bio: rewording is the route by which the original claim comes back.
 *
 * Unpublished rows are how a seat is held open. They carry no name, role or
 * bio, and a check constraint prevents publishing one that does not have all
 * three. Empty is honest; "Coming soon" as a person is not.
 *
 * The grid must survive 2, 3 or 4 published members - Ryan ships with two real
 * people and two empty seats. sm:grid-cols-2 with a centred, max-width track
 * does that without a special case per count.
 */
interface Member {
  id: string
  name: string
  role: string
  bio: string
  photo_path: string | null
}

const getTeam = unstable_cache(
  async (): Promise<Member[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, role, bio, photo_path')
      .eq('published', true)
      .order('sort_order')
      .order('created_at')

    if (error) {
      // 42P01 means migration 059 has not been applied yet.
      console.error(
        `[team] query failed (${error.code}): ${error.message} - section will render nothing. ` +
        'If 42P01, migration 059 has not been applied.'
      )
      return []
    }
    return (data ?? []) as Member[]
  },
  ['team_members'],
  { revalidate: 60, tags: ['team'] }
)

export default async function TeamSection({ className }: { className?: string }) {
  const team = await getTeam()
  // Never a heading over nothing. If the query fails or every row is
  // unpublished, the section is absent rather than showing an empty grid.
  //
  // There is no fallback any more. One existed while 059 was unapplied so the
  // section did not go dark between the deploy and the migration; it was
  // removed once the rendered output was confirmed to come from the table. A
  // fallback that outlives its verification is just a second source waiting to
  // disagree with the first.
  if (team.length === 0) return null

  const src = (p: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/page-images/${p}`

  return (
    <section className={className}>
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: '#8B7355' }}>
          <span className="text-emboss">The Team</span>
        </h2>
        <p className="mb-8 text-center text-xs" style={{ color: '#666' }}>
          <span className="text-emboss">The people behind the convention</span>
        </p>
        {/* Columns track the member count so 2, 3 or 4 all sit centred rather
            than leaving dead cells at the end of a fixed 4-up grid. Carried
            across unchanged from the hardcoded version - Ryan ships with two
            real people and two empty seats, so the 2-column case is the one
            that actually renders on day one. */}
        <div
          className={`mx-auto grid gap-4 sm:grid-cols-2 ${
            team.length >= 4 ? 'lg:max-w-none lg:grid-cols-4'
              : team.length === 3 ? 'lg:max-w-3xl lg:grid-cols-3'
              : 'lg:max-w-2xl lg:grid-cols-2'
          }`}
        >
          {team.map(member => (
            <div
              key={member.id}
              className="rounded-2xl p-6 text-center"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            >
              {member.photo_path ? (
                // The name IS the alt text. A portrait's alt should say who it
                // is, and there is no second sentence worth writing - which is
                // why the table has no alt column and instead requires a name
                // before a photo may be set.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src(member.photo_path)}
                  alt={member.name}
                  className="mx-auto mb-4 h-16 w-16 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                // Initials, not a stock silhouette. A generic avatar of a person
                // who is not that person is a small version of the same problem
                // this table exists to prevent.
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ backgroundColor: '#2a2a2a' }}
                >
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
              <h3 className="text-sm font-bold text-white">{member.name}</h3>
              <p className="mt-1 text-xs font-medium" style={{ color: '#C4A882' }}>{member.role}</p>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: '#999' }}>{member.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
