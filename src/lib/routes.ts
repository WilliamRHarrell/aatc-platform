/**
 * Public page URLs - ONE HOME per URL. The header (components/PublicNav.tsx)
 * and the footer (components/SiteFooter.tsx) both link through this map, so
 * moving or renaming a page updates both. Each menu keeps its own labels,
 * grouping and order; only the destination is shared.
 */
export const ROUTES = {
  home: '/',
  vote: '/contests',
  tickets: '/tickets',

  // Events
  tattooBattle: '/tattoo-battle',
  tattooContests: '/events/tattoo-contests',
  kidsContest: '/events/kids-contest',
  panels: '/events/tattoo-panels',
  schedule: '/events/schedule',
  pinupContest: '/events/pinup-contest',
  foodTruckRodeo: '/events/food-truck-rodeo',
  datingGame: '/events/dating-game',
  strongestSideshow: '/events/strongest-sideshow',
  medievalCombat: '/events/medieval-combat',
  afterParties: '/events/after-parties',
  vipMeetGreet: '/events/vip-meet-greet',

  // Event info
  about: '/info/about',
  directions: '/info/directions',
  staying: '/info/staying',
  policies: '/info/policies',
  wallOfHonor: '/info/wall-of-honor',

  // Artists & vendors
  apply: '/apply',
  directory: '/directory',
  findArtist: '/directory/artists',
  portal: '/portal',
  /** Portal sign-in: the login page, returning to the portal. */
  portalSignIn: '/auth/login?redirect=/portal',

  // Sponsors
  sponsors: '/sponsors',
  sponsorPackages: '/sponsors/packages',
  sponsorApply: '/apply/sponsor',
} as const

export type RouteKey = keyof typeof ROUTES
