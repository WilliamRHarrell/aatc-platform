import { describe, it, expect } from 'vitest'
import { defaultsFor, REGISTRY, PAGE_ROUTE, routesFor } from '@/content/registry'
import { ALLOWED_PATHS } from '@/lib/revalidate-paths'
import { VENUE_POLICIES_URL } from '@/lib/event-config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * After parties are data (schedule rows + venues, migration 070). The homepage
 * copy around that grid must not claim venues are unannounced or enumerate
 * the nights, because the grid directly above it renders whatever is
 * published. page_content has no rows, so these defaults ARE the live copy.
 */
describe('homepage after-party copy', () => {
  const c = defaultsFor('homepage')
  it('does not say venues are still to be announced', () => {
    expect(c.afterparty_note.toLowerCase()).not.toMatch(/announced|tba|to be confirmed/)
    expect(c.afterparty_intro.toLowerCase()).not.toMatch(/announced|tba|to be confirmed/)
  })
  it('does not enumerate the nights (the data decides which nights exist)', () => {
    expect(c.afterparty_intro.toLowerCase()).not.toMatch(/thursday through|friday through|three nights|3 nights/)
  })
})

describe('about page registry', () => {
  it('registers every text block on /info/about with the current copy as default', () => {
    const c = defaultsFor('about')
    for (const key of [
      'hero_kicker', 'hero_title', 'hero_intro',
      'different_title',
      'diff_1_title', 'diff_1_body', 'diff_2_title', 'diff_2_body', 'diff_3_title', 'diff_3_body', 'diff_4_title', 'diff_4_body',
      'story_title', 'story_subtitle', 'story_body',
      'fayetteville_title', 'fayetteville_subtitle', 'fayetteville_body',
      'gallery_title', 'cta_title', 'cta_lead',
    ]) {
      expect(c[key], key).toBeTruthy()
    }
    // The founding story and the Fayetteville section are multi-paragraph.
    expect(c.story_body.split('\n\n')).toHaveLength(3)
    expect(c.fayetteville_body.split('\n\n')).toHaveLength(3)
    expect(c.hero_title).toBe('About AATC')
  })
})

describe('PAGE_ROUTE', () => {
  it('maps every registered page to the public path(s) the content editor must purge', () => {
    for (const page of REGISTRY) {
      expect(routesFor(page.key).length, `route for ${page.key}`).toBeGreaterThan(0)
    }
    expect(PAGE_ROUTE.applyHub).toBe('/apply')
    expect(PAGE_ROUTE.about).toBe('/info/about')
  })
  it('every registry route is in the revalidate allow-list, or the purge silently does nothing', () => {
    for (const page of REGISTRY) {
      for (const r of routesFor(page.key)) expect(ALLOWED_PATHS.has(r), r).toBe(true)
    }
  })
})

/**
 * The veteran upload wording is editable at /admin/content (2026-09-24). The
 * label keeps the wording that shipped; the help text is Ryan's string
 * verbatim, and it must keep telling applicants NOT to upload a CAC.
 */
describe('booth application forms registry', () => {
  const c = defaultsFor('applyForms')
  it('keeps the current label and carries the veteran proof help text', () => {
    expect(c.veteran_doc_label).toBe('Veteran ID / proof of service')
    expect(c.veteran_doc_help).toBe("Veteran discount: upload a DD-214, VA ID card, or driver's license with veteran designation. Do not upload a military ID (CAC).")
  })
  it('purges both apply form routes', () => {
    expect(routesFor('applyForms')).toEqual(['/apply/artist', '/apply/vendor'])
  })
})

/**
 * Crown Complex venue policies on /info/policies (Ryan, 2026-09-29). Our own
 * summary, linked to the Crown's page as the official source; bags, drinks and
 * re-entry first; the page's General Rules no longer carry a second copy of
 * re-entry, weapons, smoking or animals.
 */
describe('policies page venue section', () => {
  const c = defaultsFor('policies')
  const page = readFileSync(join(process.cwd(), 'src/app/info/policies/page.tsx'), 'utf8')

  it('registers every venue block with copy', () => {
    for (const key of [
      'venue_title', 'venue_intro',
      'venue_bags_title', 'venue_bags_body', 'venue_food_title', 'venue_food_body',
      'venue_reentry_title', 'venue_reentry_body', 'venue_other_title', 'venue_other_body',
    ]) expect(c[key], key).toBeTruthy()
    expect(PAGE_ROUTE.policies).toBe('/info/policies')
  })
  it('says the Crown sets the rules and can change them, and links the official page', () => {
    expect(c.venue_intro).toMatch(/can change/)
    expect(VENUE_POLICIES_URL).toBe('https://www.crowncomplexnc.com/visit/venue-policies')
    expect(page).toContain('href={VENUE_POLICIES_URL}')
  })
  it('renders bags, then food and drinks, then re-entry, then the rest', () => {
    const order = ['c.venue_bags_title', 'c.venue_food_title', 'c.venue_reentry_title', 'c.venue_other_title'].map(k => page.indexOf(k))
    expect(order.every(i => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('states the Pepsi rule and the wristband rule', () => {
    expect(c.venue_food_body).toMatch(/Pepsi/)
    expect(c.venue_reentry_body).toMatch(/not be replaced/)
  })
  it('General Rules no longer repeat what the venue section states', () => {
    for (const t of ["'Re-Entry'", "'Weapons'", "'Smoking'", "'Pets & Service Animals'"]) expect(page, t).not.toContain(`title: ${t}`)
  })
})
