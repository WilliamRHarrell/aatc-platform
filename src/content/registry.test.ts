import { describe, it, expect } from 'vitest'
import { defaultsFor } from '@/content/registry'

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
