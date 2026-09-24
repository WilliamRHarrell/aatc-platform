import { describe, it, expect } from 'vitest'
import { defaultsFor, REGISTRY, PAGE_ROUTE, routesFor } from '@/content/registry'
import { ALLOWED_PATHS } from '@/lib/revalidate-paths'

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
