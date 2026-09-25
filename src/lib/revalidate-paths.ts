/**
 * What /api/revalidate may purge. Lives outside the route file so tests can
 * assert every registry page route is here (registry.test.ts): a route missing
 * from this list makes the content editor's purge a silent no-op and the edit
 * waits out the 60 s window.
 */
export const ALLOWED_PATHS = new Set([
  '/', '/apply', '/apply/artist', '/apply/vendor', '/tickets', '/contests', '/sponsors', '/tattoo-battle',
  '/events/after-parties', '/events/schedule', '/events/kids-contest', '/events/pinup-contest', '/info/about',
])
// Entry pages are dynamic: /tattoo-battle/entry/<n>. Pattern-matched so an
// admin publish can purge exactly the bucket it touched.
export const ALLOWED_PATH_PATTERNS = [/^\/tattoo-battle\/entry\/[1-9]\d{0,2}$/]
export const ALLOWED_TAGS = new Set(['page_content', 'sponsors', 'panels', 'contests', 'tattoo-battle', 'after-parties', 'schedule', 'pinup'])
