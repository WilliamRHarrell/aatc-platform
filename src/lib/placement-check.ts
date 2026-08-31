/**
 * The standing placement check.
 *
 * Four owed-and-unrendered instances have been found in this project, every one
 * of them by accident and none by design. This is the check that would have
 * found them, and the reason it can exist at all is that
 * `sponsor-placements.ts` turned "what was promised" from prose into data.
 *
 * IT REPORTS IN THREE DIRECTIONS, because every instance so far was noticed
 * from one side only:
 *
 *   missing_placement   a confirmed sponsor is owed a placement the flags do
 *                       not grant. Owed-and-unrendered, from the promise side.
 *   unrendered_credit   a presentation credit sits on an item that reaches no
 *                       page. Sold-and-unrendered - the Nomadica defect, where
 *                       every row was correct and the PAGE dropped it.
 *   extra_placement     a placement granted that the tier does not promise.
 *                       Informational: a placement can be given deliberately and
 *                       nothing records that it was, so this is a list to
 *                       explain, not a list to correct.
 *
 * ⚠  IT NEVER COMPARES A STORED TIER AGAINST A STORED AMOUNT. That is enforced
 * one layer down: `missingPlacements` cannot receive an amount. See the non-goal
 * at the top of sponsor-placements.ts, and the Tattoo Goo case that made it a
 * rule. Any new check over `sponsorships` should be run against Tattoo Goo
 * specifically before it is trusted - three separate false positives have now
 * been caught against that one row, which is also the only real sponsorship in
 * the database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  missingPlacements,
  extraPlacements,
  PLACEMENT_LABEL,
  type PlacementFlags,
} from './sponsor-placements'
import { isHarnessSponsor } from './sponsor-display'

export type FindingKind = 'missing_placement' | 'unrendered_credit' | 'extra_placement'

export interface Finding {
  /** Stable identity for the what-changed diff. Never include free text. */
  key: string
  kind: FindingKind
  /** One sentence, written to be actionable on its own in an email subject. */
  message: string
  /** False for extra_placement - informational, and must not trigger an alert. */
  actionable: boolean
}

export interface CheckResult {
  findings: Finding[]
  findingKeys: string[]
}

/**
 * Runs the check. Cheap by construction - four small table reads, no joins that
 * fan out - which is why it folds into the existing 09:00 lifecycle sweep
 * rather than taking a cron entry of its own. One job that does two things
 * beats two jobs nobody watches.
 *
 * Throws on a query failure rather than returning an empty result. An empty
 * result means "checked, found nothing"; a failure that returned empty would be
 * indistinguishable from all-clear and would suppress alerts about findings
 * that are still live. The caller records the error instead.
 */
export async function runPlacementCheck(
  supabase: SupabaseClient<Database>,
): Promise<CheckResult> {
  const findings: Finding[] = []

  // ── 1. Placements owed against placements granted ─────────
  //
  // SCOPED TO CONFIRMED, and that scope is load-bearing. A pending sponsor is
  // owed nothing yet: run this over every row and Tattoo Goo - pending gold -
  // reports as missing homepage and footer, which is correct output to the
  // wrong question. Confirming is the publish gate everywhere else on this
  // site; it is the gate here too.
  const { data: sponsorships, error: sponsorErr } = await supabase
    .from('sponsorships')
    .select('id, sponsor_name, tier, status, show_on_homepage, show_on_sponsors, featured_footer, show_on_vote_pages')
    .eq('status', 'confirmed')

  if (sponsorErr) throw new Error(`sponsorships query failed (${sponsorErr.code}): ${sponsorErr.message}`)

  for (const s of sponsorships ?? []) {
    // The RLS harness rows are deliberate test data, not sponsors. Reporting
    // them would put a permanent false finding on the card, and a card with a
    // finding nobody will ever clear is a card people stop reading.
    if (isHarnessSponsor(s.sponsor_name)) continue

    const flags = s as unknown as PlacementFlags & { id: string; sponsor_name: string }

    for (const p of missingPlacements(flags)) {
      findings.push({
        key: `missing_placement:${flags.id}:${p}`,
        kind: 'missing_placement',
        message: `${flags.sponsor_name} is missing ${PLACEMENT_LABEL[p]} placement, which ${flags.tier} includes.`,
        actionable: true,
      })
    }

    for (const p of extraPlacements(flags)) {
      findings.push({
        key: `extra_placement:${flags.id}:${p}`,
        kind: 'extra_placement',
        message: `${flags.sponsor_name} has ${PLACEMENT_LABEL[p]} placement, which ${flags.tier} does not include. Deliberate, or left over?`,
        actionable: false,
      })
    }
  }

  // ── 2. Credits that reach no page ─────────────────────────
  //
  // Covers BOTH sources: a presentation_credits row and the older
  // presented_by_fallback text. They are the same promise recorded two ways, so
  // a check that watched only one would keep missing half of them.
  //
  // The rendering conditions are reproduced from the pages, not assumed:
  //
  //   schedule_items - rendered when is_published.
  //   panels         - rendered when is_published AND panel_day matches a day
  //                    the programme actually has. /events/schedule builds its
  //                    day list from schedule_items and keeps only panels whose
  //                    panel_day is in it, so a panel dated outside the show is
  //                    dropped in silence.
  //
  // That second condition is still worth checking after migration 064's
  // constraint. The constraint guarantees a published panel HAS a day; it
  // cannot guarantee the day is one the programme runs on. A seminar moved to
  // 2027-04-20 would satisfy the constraint and vanish from the page.
  const [{ data: days, error: daysErr }, { data: panels, error: panelsErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase.from('schedule_items').select('day_date'),
      supabase.from('panels').select('id, title, is_published, panel_day, presented_by_fallback'),
      supabase.from('schedule_items').select('id, title, is_published, presented_by_fallback'),
    ])

  if (daysErr) throw new Error(`schedule day query failed (${daysErr.code}): ${daysErr.message}`)
  if (panelsErr) throw new Error(`panels query failed (${panelsErr.code}): ${panelsErr.message}`)
  if (itemsErr) throw new Error(`schedule_items query failed (${itemsErr.code}): ${itemsErr.message}`)

  const programmeDays = new Set((days ?? []).map(d => d.day_date))

  const { data: creditItems, error: creditErr } = await supabase
    .from('presentation_credit_items')
    .select('schedule_item_id, panel_id, presentation_credits!inner(buyer_name, status)')

  if (creditErr) throw new Error(`credit items query failed (${creditErr.code}): ${creditErr.message}`)

  const creditForPanel = new Map<string, string>()
  const creditForItem = new Map<string, string>()
  for (const ci of (creditItems ?? []) as unknown as Array<{
    schedule_item_id: string | null
    panel_id: string | null
    presentation_credits: { buyer_name: string; status: string } | null
  }>) {
    if (ci.presentation_credits?.status !== 'confirmed') continue
    const name = ci.presentation_credits.buyer_name
    if (ci.panel_id) creditForPanel.set(ci.panel_id, name)
    if (ci.schedule_item_id) creditForItem.set(ci.schedule_item_id, name)
  }

  for (const p of panels ?? []) {
    const credit = creditForPanel.get(p.id) ?? p.presented_by_fallback
    if (!credit) continue

    if (!p.is_published) {
      findings.push({
        key: `unrendered_credit:panel:${p.id}:unpublished`,
        kind: 'unrendered_credit',
        message: `${credit} is credited on "${p.title}", which is not published, so the credit renders nowhere.`,
        actionable: true,
      })
    } else if (!p.panel_day || !programmeDays.has(p.panel_day)) {
      findings.push({
        key: `unrendered_credit:panel:${p.id}:offprogramme`,
        kind: 'unrendered_credit',
        message: `${credit} is credited on "${p.title}", whose date is not a day the programme runs, so /events/schedule drops it.`,
        actionable: true,
      })
    }
  }

  for (const it of items ?? []) {
    const credit = creditForItem.get(it.id) ?? it.presented_by_fallback
    if (credit && !it.is_published) {
      findings.push({
        key: `unrendered_credit:schedule_item:${it.id}:unpublished`,
        kind: 'unrendered_credit',
        message: `${credit} is credited on "${it.title}", which is not published, so the credit renders nowhere.`,
        actionable: true,
      })
    }
  }

  return { findings, findingKeys: findings.map(f => f.key).sort() }
}

/**
 * What changed since the previous run.
 *
 * The email says this, not the full set. "3 findings" when it said "3 findings"
 * last week is ignorable, and a reader who learns to ignore this channel has
 * lost it - which matters more than usual here, because this shares an inbox
 * with the alert for a payment taken and not recorded.
 */
export function diffFindings(current: Finding[], previousKeys: string[]) {
  const prev = new Set(previousKeys)
  const curr = new Set(current.map(f => f.key))
  return {
    added: current.filter(f => !prev.has(f.key)),
    resolvedKeys: previousKeys.filter(k => !curr.has(k)),
  }
}
