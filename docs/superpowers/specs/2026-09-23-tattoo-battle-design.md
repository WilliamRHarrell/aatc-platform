# The All American Tattoo Battle: design

Date: 2026-09-23. Status: APPROVED by Ryan 2026-09-23 with the amendments recorded inline (marked "Decided").

Three deliverables: the public page at `/tattoo-battle`, the QR landing page at
`/tattoo-battle/entry/[bucket]`, and the admin at `/admin/tattoo-battle`. Ryan's
brief is the source for every rule, every line of copy and every hard rule. This
document records how it maps onto the repo, the decisions that needed a call,
and what was found in the live environment while surveying.

Everything under "Decisions" is a default that Ryan can overturn. Nothing is
built until this document is approved.

---

## 1. What was found (live environment and repo)

### 1.1 Where the domain points today

- `allamericantattooconvention.com` 308-redirects to `www.`, and `www.` is
  served by the **`aatc-landing`** Vercel project, not this repo. Its homepage
  title is "All American Tattoo Convention — April 16–18, 2027". Every other
  path on it returns Vercel's 404.
- `aatc-platform.vercel.app` is this repo, robots `Disallow: /`, which means
  production `NEXT_PUBLIC_SITE_URL` is still the preview host (HANDOFF §4).
- The WordPress site is gone from the domain. The Wayback Machine has the old
  battle page at **`/all-american-tattoo-battle-rules-signup/`** (snapshots
  2024-12-07 and 2025-01-23) plus two attachment sub-URLs under it
  (`.../aatc_battle/`, `.../aatc_battle-white/`). No sitemap was ever archived.
  The old page's text was retrieved and is quoted in §9 where it differs from
  the brief.

### 1.2 Sponsor row and schedule rows already live

- `sponsors_public` has a **confirmed** row: `sponsor_name = 'Whole Life
  Aftercare'`, tier gold, `logo_url` in `exhibitor-media`, website
  `https://wholelifeaftercare.com/`, instagram `@wholelife.aftercare`,
  `show_on_vote_pages = false`.
- `schedule_items_public` has the three battle rows for the active event
  (`28a3ad3d-…`): Fri 2027-04-16 13:00 "All American Tattoo Battle Begins", Fri
  17:00 "Tattoo Battle Ends - Voting Opens", Sun 2027-04-18 18:00 "All American
  Tattoo Battle Champion Crowned". All three carry `presented_by = 'Whole Life
  Aftercare'` (text fallback, migration 065 precedence).
- `TATTOO_BATTLE_PRESENTER = 'Whole Life Aftercare'` in
  `src/lib/event-config.ts` is the one home for the presenter name and is
  imported by the homepage card and the kids-contest page.

### 1.3 Existing RLS and storage policies (from migrations; live DB not queryable from here)

No management token exists locally, so this is read from the migration files.
Migration 069's verify block will pin the live state (HANDOFF: "read the live
shape, not the last migration that touched it").

| table | policies |
|---|---|
| `events` | `events: public read` (select, `using (true)`); `events: admin write` (all, `is_admin()`); one active row enforced by `events_one_active_idx` (034) |
| `profiles` | own read/update; admin read all; admin update all (001); self-edit + `profile_edits` audit (048) |
| `contests` | public read `using (true)`; admin write; `contests: editorial write` = `has_role(array['admin','content_editor'])` (054) |
| `contest_entries` | public read `using (true)`; admin write (inline profiles subquery, legacy shape) (008) |
| `page_images` | `anyone reads active page images` (`active = true`); `page_images: editorial write` (054) |
| `sponsorships` | anon select **revoked** (038); public surface is the `sponsors_public` view; own-read and own-update policies for the sponsor (030, 049) |

Admin in SQL is `public.is_admin()` (security definer, pinned `search_path`,
027). Editorial tables use `has_role(array['admin','content_editor'])` (039,
054). New policies must use these helpers, never an inline `profiles` subquery
(that shape caused the 42P17 recursion in 027/028).

Storage buckets (live, read via the storage API with the service key):

| bucket | public | limit | mime |
|---|---|---|---|
| `application-docs` | no | 50 MB | jpeg, png, webp, pdf |
| `contest-photos` | yes | 10 MB | jpeg, png, webp |
| `exhibitor-media` | yes | 20 MB | jpeg, png, webp |
| `site-assets` | yes | 10 MB | (dashboard-created, no migration) |
| `food-truck-logos` | yes | 5 MB | jpeg, png, webp |
| `panel-images` | yes | 5 MB | jpeg, png, webp |
| `page-images` | yes | 10 MB | jpeg, png, webp |

`storage.objects` policies follow one shape: public read `using (bucket_id =
'<name>')`; writes `to authenticated` with `bucket_id = '<name>' and
public.is_admin()` or `has_role(...)`. The largest per-bucket limit in the
project is 50 MB, so the project's global limit is at least that. The global
limit itself is only visible in Dashboard → Storage → Settings. **CONFIRM** it
before choosing a video cap above 50 MB (§5.2).

### 1.4 Repo conventions that bind this feature

- **No server actions exist.** Admin pages are `'use client'`, write through
  the browser Supabase client under RLS, and wrap every write in
  `guardedWrite()` (`src/lib/db-write.ts`). Privileged operations go through
  `/api/admin/*` route handlers that check `profiles.role` then use the service
  key. The brief says "server actions"; the repo's equivalent is this pattern
  and the design follows it rather than introducing a second auth model.
- **Uploads are client-side** `supabase.storage.from(bucket).upload()`, guarded
  by storage RLS; rollback direction "follows which failure is visible"
  (`admin/page-images/page.tsx`).
- **Revalidation** is `/api/revalidate` (admin session, allow-listed paths and
  tags) called from the browser via `requestRevalidate()`. New paths and tags
  must be added to the allow-lists or the purge silently no-ops.
- **A fact gets one home.** Times live in `schedule_items`; presenter, venue,
  prices in `event-config.ts`; copy in the registry or config. §3.3 resolves
  the one conflict this creates with the brief.
- **No em or en dashes in `src/`** (prebuild guard). Copy uses hyphens.
- **No placeholder humans or borrowed fallback assets.** A missing logo renders
  the name as text.
- **No test framework** exists. Verification is prebuild guards, hand-run node
  scripts against the anon key, and SQL verify files. §8 adds the minimum.
- `src/types/database.ts` is hand-maintained; it will be extended for the new
  table.

---

## 2. Routes and components

```
src/app/tattoo-battle/page.tsx                 server. metadata, JSON-LD, all sections
src/app/tattoo-battle/entry/[bucket]/page.tsx  server. generateMetadata (noindex until published)
src/app/admin/tattoo-battle/page.tsx           'use client' admin (slots, media, publish, champion)
src/app/admin/tattoo-battle/print/page.tsx     'use client' QR sheet + ZIP

src/components/tattoo-battle/
  BattleCountdown.tsx      client island (thin wrapper, see §2.2)
  MediaCarousel.tsx        client island (the only other one)
  BattleHero.tsx           server
  BattleSection.tsx        server: section chrome with the splatter edge
  EntryCard.tsx            server
  ChampionBanner.tsx       server
  PresentedByWholeLife.tsx server: sponsor row → logo+link, else name as text

src/lib/tattoo-battle-config.ts   every constant the brief lists, every // CONFIRM
src/lib/tattoo-battle-data.ts     cached anon reads: published entries, champion, schedule rows
src/lib/tattoo-battle.ts          pure helpers: bucket validation, judging time, entry URL, alt text
src/lib/tattoo-battle-media.ts    client helpers: type/size checks, poster capture
```

### 2.1 `/tattoo-battle` (server-rendered)

Sections in order, exactly as the brief lists them. Rendering rules:

- **Hero**: the full-colour lockup (fist + wordmark) cropped from the vector
  master, `<h1>` is real text "The All American Tattoo Battle" with the
  lockup as a decorative image above it. Kicker line "3rd Annual · Fayetteville
  - Fort Bragg, NC · April 16-18, 2027" is built from `BATTLE_EDITION`,
  `VENUE_CITY`-style constants and `EVENT_DATES_LABEL`, not typed. Presented-by
  block from the sponsor row (§3.4). CTAs: "Get a Booth" → `/apply` (the hub
  every other booth CTA uses) and "How It Works" → `#how-it-works`.
- **Countdown** to `BATTLE_START`, using the refactored `Countdown` (§2.2).
- **Who Can Battle**, **Competition Rules**: bullet cards from config arrays.
- **How the Winner Is Decided**: the feature section. Two big columns
  "Judges' score" and "The People's Vote" joined by a plus sign, then a full-width
  "Sunday: counted, combined, crowned" band. The extra sentence "Only money in
  the buckets counts toward the vote." renders when
  `ONLINE_DONATIONS_COUNT_AS_VOTES` is false.
- **This Year's Battle**: grid of published entries; whole section omitted when
  none are published. Champion banner above the hero content when a champion is
  set.
- **About Veteran Ink**: description from config, logo (§3.5), site and donate
  links with `rel="noopener"`. No tax-deductible language, no percentages, no
  statistics.
- **Weekend Timeline**: six steps. Step times come from the three schedule rows
  (§3.3); the judging step is `BATTLE_START + BATTLE_DURATION_HOURS`. Closes
  with "LFG!!" in the display face.
- **Prizes** from `PRIZES`. **Past Champions** from `PAST_CHAMPIONS`, hidden
  while empty.
- **For Attendees**, **Sponsor block**, **FAQ** (the eight questions, answers
  composed from the same config values so they cannot drift from the rules).

### 2.2 Countdown reuse

`src/components/home/Countdown.tsx` takes no props and reads the show dates
from config. It will gain optional props `{ target?: string; window?: { open:
string; close: string }; during?: ReactNode; after?: ReactNode }` with defaults
equal to today's behaviour, so the homepage is unchanged and
`BattleCountdown` is a ten-line wrapper. This is the one edit to an existing
component.

### 2.3 `/tattoo-battle/entry/[bucket]`

- `bucket` must match `/^\d+$/` and be within `1..BUCKET_COUNT`; else
  `notFound()`.
- Data: one row from `tattoo_battle_entries` for the active event and that
  bucket, read as anon, so an unpublished row is invisible by RLS and the page
  cannot leak a draft even by mistake.
- Holding state and published state exactly as the brief. Video items render
  `<video playsInline muted controls preload="metadata" poster=…>`; every item
  past the first is lazy. Entry alt text: "Tattoo Battle entry, Bucket #N, by
  [artist]".
- `generateMetadata`: `robots: { index: false }` until published; OG image is
  the first image item's public URL, else the battle OG image.
- `dynamicParams` on, no `generateStaticParams`; the route is ISR with a 60 s
  window like every other public page, and admin publish purges it instantly.

### 2.4 Admin `/admin/tattoo-battle` (phone-first)

- Slot list 1..`BUCKET_COUNT`, status pill empty / draft / published, champion
  crown on the champion.
- Per slot (expand in place, no modal, thumbs big enough for a thumb):
  artist, shop, city/state, Instagram; file picker with camera-roll access
  (`accept` image and video, see §5.1); upload progress per file; thumbnails
  with move up / move down / remove; Publish / Unpublish; Clear slot
  (confirm).
- **Mark as champion** → Radix `Dialog` confirm → RPC
  `set_tattoo_battle_champion(entry_id)` (§4.4). Unsetting is the same RPC with
  `null`.
- After every publish, unpublish, champion or clear: `requestRevalidate({ paths:
  ['/tattoo-battle', '/tattoo-battle/entry/N'], tags: ['tattoo-battle'] })`.
- Warning banner at the top: "Shoot video at 1080p, keep clips under about 30
  seconds, and on iPhone set Camera → Formats → Most Compatible." (§5.1).
- Link to **Print QR codes**.

### 2.5 Admin `/admin/tattoo-battle/print`

- One code per bucket, `qrcode` package, error correction `H`, rendered as
  inline SVG. Label block: "BUCKET #N", "Scan to see the tattoo · Vote with your
  dollars", the Veteran Ink and WholeLife credits, the URL in small type under
  the code so a dead scanner can still be typed.
- Print CSS: `@page { size: 4in 6in; margin: 0.25in }`, one label per page,
  `break-after: page`. Screen view shows the same cards in a grid.
- "Download all as ZIP": `jszip` in the browser, one `bucket-NN.svg` per code.
- Base URL: **`QR_BASE_URL = 'https://www.allamericantattooconvention.com'`**,
  a fixed constant in `tattoo-battle-config.ts`, never the site URL env var
  (Decided: codes are physical and must not depend on which host a build ran
  on). While `IS_PRODUCTION_HOST` is false the page shows a warning banner:
  "Domain not cut over to this project yet - scans will 404 until cutover."
  Printing is never blocked. See §3.6 and the launch checklist in §11.

---

## 3. Decisions (defaults Ryan can overturn)

### 3.1 Top-level route
`/tattoo-battle`, as the brief says, not `/events/tattoo-battle`. It matches
the old WordPress URL's depth and the brief's QR URLs. It joins the Events
dropdown in `PublicNav`; the dropdown highlights by `/events` prefix, so the
menu logic gets a small explicit-href check for this one entry.

### 3.2 Spelling: "WholeLife Aftercare"
The brief says use exactly "WholeLife Aftercare". The repo and the database
say "Whole Life Aftercare" in: `TATTOO_BATTLE_PRESENTER`, the sponsorships row,
the three schedule rows' `presented_by_fallback`, `verify_044.sql`, the
unapplied `three_sponsors_invoices_exclusivity.sql` seed, and the kids-contest
page via the constant. Their own logo reads "Wholelife".

Decided: **change the constant to "WholeLife Aftercare"** and ship a
data-change seed `supabase/seeds/wholelife_spelling.sql` (guarded like
`tattoo_battle_credit.sql`: asserts the before-count, updates
`sponsorships.sponsor_name` and the three `presented_by_fallback` values,
asserts the after-count) for Ryan to run, and update `verify_044`'s expected
string. Until the seed runs, the sponsor block would render the row's
two-word name, so the page is consistent with the site either way, never
mixed on one page.

(Alternative rejected: keeping the two-word spelling.)

### 3.3 Battle times: one home
The brief puts `BATTLE_START` in config and derives judging time from
`BATTLE_DURATION_HOURS`. HANDOFF says times live in `schedule_items`. Both are
satisfied like this:

- `BATTLE_START` stays in config because the countdown and the JSON-LD
  `startDate` need an absolute instant at build time.
- `scripts/check-event-dates.mjs` gains a second assertion: `BATTLE_START` in
  America/New_York must equal the day and time of the active event's schedule
  row titled like `%Tattoo Battle Begins%`. A disagreement fails the build,
  exactly as the show dates do today.
- The timeline and FAQ render the Friday start, the voting-opens moment and
  the Sunday crowning from the three schedule rows via `getSchedule()` (already
  cached and already used by two pages). The judging step is computed from
  `BATTLE_START + BATTLE_DURATION_HOURS` and the page asserts at render time
  that it equals the "Voting Opens" row; if they ever disagree it logs and
  shows the schedule row's time, because the schedule is the programme.
- `WINNER_ANNOUNCED_TIME` is therefore not a config value at all: the Sunday
  6:00 PM row already exists and the homepage card already says "crowned
  Sunday at 6:00 PM". Decided: 6:00 PM is correct. The config keeps
  `WINNER_ANNOUNCED` as the date label only.

### 3.4 Sponsor block source
The confirmed `sponsors_public` row carries logo, website and Instagram, so
the hero and the sponsor block read it (cached, tag `sponsors`, same shape as
`VotePageSponsors`). If the row is ever missing or unconfirmed, the block
renders "Presented by {TATTOO_BATTLE_PRESENTER}" as text with the Instagram
link from config, never a borrowed logo. The Dropbox WholeLife PNGs are not
needed. Nothing about tier, amount, exclusivity or invoices is read.

### 3.5 Veteran Ink logo
Decided: a `page_images` slot `tattoo-battle-veteran-ink`, seeded by the
migration, filled from `/admin/page-images` once Ryan has the file. Renders
nothing until then, and needs no deploy when the file arrives. The file is
coming later; the slot ships empty.

### 3.6 QR base URL and the cutover
Decided: a fixed `QR_BASE_URL = 'https://www.allamericantattooconvention.com'`
in config; the env var is not consulted for QR codes. `www.` is the canonical
host. The print page warns (never blocks) while the build is not on the
production host. Domain cutover is a launch-checklist item (§11).

### 3.7 Who can use the admin
Decided: `admin` and `content_editor`, the same as `/admin/contests` and
`/admin/page-images`. That means the table policy and the bucket policies use
`has_role(array['admin','content_editor'])`, `roles.ts` adds the path for
`content_editor`, and the RPC checks the same. Reason: the person publishing
entries on the show floor is more likely an editor than the one admin.
(Alternative rejected: admin only.)

### 3.8 HEIC and HEVC from iPhones
Browsers cannot display HEIC, and Chrome cannot play HEVC `.mov`. iOS Safari
transcodes to JPEG and H.264 automatically **when the file input's `accept`
list does not include the HEIC/HEVC types**. Decided: the bucket's allowed
types are **jpeg, png, webp, mp4 and quicktime only**, matching the admin file
input's `accept` list exactly (HEIC removed from the bucket at Ryan's
direction; `.mov` stays because iOS emits H.264 in a `.mov` container). The
client rejects a HEIC file that arrives anyway with: "That photo is HEIC. On
iPhone, set Camera → Formats → Most Compatible, or share it as JPEG." Same
message shape for a video the browser cannot decode.

### 3.9 Video posters
Captured in the browser at upload: load the file into a `<video>`, seek to
0.5 s, draw to a canvas, upload the JPEG as `poster_path`. If decoding fails
the item saves without a poster and the admin sees a "Set poster" button that
accepts an image. Public pages render a video without a poster as a dark
frame with the play control, never a broken image.

### 3.10 Size limits
Decided: bucket limit **50 MB**. H.264 1080p from an iPhone runs roughly
1.5 MB per second, so 50 MB is about 30 seconds; the admin warning says so.
The project's global limit was not confirmed; 50 MB is at or below the
largest existing bucket, so it is safe under any plan.

### 3.11 Tests
Decided: add `vitest` as a dev dependency and a `test` script, for the pure
helpers only (bucket validation, judging-time derivation, entry URL, alt
text, media-array reorder). DB behaviour is verified by
`supabase/verify/verify_069.sql` (run in the SQL editor) and by
`scripts/verify-tattoo-battle-anon.mjs` (anon-key assertions with a
service-role positive control, modelled on `verify-sponsor-visibility.mjs`).
Nothing DB-touching runs in CI, matching the repo.

### 3.12 Old URL redirect
Decided: approved. `next.config.ts` `redirects()` entry
`/all-american-tattoo-battle-rules-signup/:path*` → `/tattoo-battle`,
`permanent: true` (301). The two attachment sub-URLs are covered by the
wildcard.

---

## 4. Data

### 4.1 Migration `069_tattoo_battle.sql`

```
table public.tattoo_battle_entries
  id              uuid pk default gen_random_uuid()
  event_id        uuid not null references events(id) on delete cascade
  bucket_number   int  not null check (bucket_number >= 1)
  artist_name     text not null default ''
  shop_name       text not null default ''
  city_state      text not null default ''
  instagram       text not null default ''
  media           jsonb not null default '[]'  check (jsonb_typeof(media) = 'array')
  is_published    boolean not null default false
  is_champion     boolean not null default false
  created_at, updated_at timestamptz not null default now()

unique (event_id, bucket_number)
unique index tattoo_battle_one_champion_per_event on (event_id) where is_champion
check tattoo_battle_publish_complete:
      not is_published or (length(trim(artist_name)) > 0 and jsonb_array_length(media) > 0)
check tattoo_battle_champion_is_published: not is_champion or is_published
trigger set updated_at (reuse the existing helper if one exists, else define)
```

The two check constraints are the "make the invalid state unreachable" rule:
a published slot always has an artist and at least one media item, and the
champion is always visible. The partial unique index is the only-one-champion
guarantee; the RPC in §4.4 exists so the UI never has to race it.

`media` item shape (validated in TypeScript, documented in SQL comment):
`{ type: 'image' | 'video', path: string, poster_path?: string }`. Paths are
bucket-relative, like `page_images.image_path`, not full URLs.

### 4.2 RLS

```
alter table tattoo_battle_entries enable row level security;
"tattoo_battle: public read published"  for select to anon, authenticated
    using (is_published = true)
"tattoo_battle: editorial write"        for all to authenticated
    using (has_role(array['admin','content_editor']))
    with check (has_role(array['admin','content_editor']))
```

No `using (true)` baseline. An editor reading the admin list needs to see
drafts: the editorial policy's `using` covers select too, so admins and
editors read every row and everyone else reads published rows only.
`verify_069.sql` asserts: anon sees 0 of N drafts and all of M published
(with a positive control that the published row exists as service role), and
anon insert/update/delete fail. The node script repeats the anon half against
the live project.

### 4.3 Storage bucket `tattoo-battle-media`

```
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tattoo-battle-media', 'tattoo-battle-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;
policies: public read; editorial insert/update/delete (has_role) - same four-policy shape as page-images after 054
```

Object paths: `${event_id}/bucket-${NN}/${Date.now()}-${slug}.${ext}`, posters
`…-poster.jpg`.

### 4.4 RPC `set_tattoo_battle_champion(p_entry_id uuid)`

`security definer`, `set search_path = public, pg_catalog`, first line
`if not has_role(array['admin','content_editor']) then raise exception
'42501'`. In one statement: clear `is_champion` for the entry's event, then set
it on the target (skipped when `p_entry_id` is null, which is "unset"). Granted
to `authenticated` only. Called through `guardedWrite(supabase.rpc(...))`.

### 4.5 `page_images` seed row
`insert into page_images (slug) values ('tattoo-battle-veteran-ink') on
conflict do nothing;` (§3.5).

### 4.6 Not applied by me
The migration file is delivered, not run. `verify_069.sql` follows the 050+
house style (whole file, read NOTICES, a failure raises). Block Z pins the
policy list and the bucket's mime list.

---

## 5. Uploads

### 5.1 Client flow (per file)
1. Type check against the `accept` list; HEIC rejected with the iPhone hint.
2. Size check against 50 MB with the exact size in the message.
3. For video: poster capture (§3.9).
4. Upload with progress. `supabase-js` `upload()` has no progress callback;
   the upload uses `XMLHttpRequest` to the storage REST endpoint with the
   session token, which is the only way to get `upload.onprogress`. Same
   endpoint, same RLS.
5. `guardedWrite(update media = media || newItem)` on the row; on failure the
   object (and poster) is removed. Same rollback direction as page-images.

### 5.2 Limits reported
Per-bucket limits in the project range from 5 MB to 50 MB. The global limit
is not readable without a management token. **CONFIRM** in Dashboard →
Storage → Settings.

---

## 6. Config `src/lib/tattoo-battle-config.ts`

Every value from the brief, verbatim, plus `// CONFIRM` on:
`WINNER_ANNOUNCED_TIME` (see §3.3, proposed removal), `BUCKET_COUNT = 20`,
`ONLINE_DONATIONS_COUNT_AS_VOTES = false`, the optional fourth prize ("A free
booth at the 2028 show to defend the title"), `PAST_CHAMPIONS = []`,
`VETERAN_INK.donateUrl` (path `/donation` not yet verified against their
site). Event dates and venue are imported from `event-config.ts`; the
presenter name is `TATTOO_BATTLE_PRESENTER`.

Copy that is rules, not marketing (eligibility, rules, how-it-works, FAQ)
lives in this config as typed arrays. No registry entry is added: the brief
puts this content in config, and an admin-editable rulebook is not asked for.

---

## 7. Design system additions

Added to `@theme` in `globals.css`, never inline:

```
--color-battle-gold:     #8B7355   (existing gold, aliased for intent)
--color-battle-khaki:    #C4A882   (existing gold-light)
--color-battle-charcoal: #2b2b2b
--font-battle-display:   var(--font-rubik-dirt)   distressed caps for H1/H2 and "LFG!!"
--font-battle-slab:      var(--font-rye)          Western slab for subheads
--font-battle-condensed: var(--font-oswald)       condensed caps for labels
```

Fonts via `next/font/google` in the battle page's own layout segment so the
rest of the site does not download them. Decided: Rubik Dirt, Rye and Oswald
from Google Fonts. If licensed webfonts for the lockup's faces arrive later
they replace these behind the same tokens.

Assets in `/public/images/tattoo-battle/`, cropped from the vector master
(already rasterised at 2400 px with transparency): `lockup-full.png`,
`fist.png`, `wordmark-stacked.png`, `badge.png`, plus `splatter-top.png` and
`splatter-bottom.png` cut from the carousel frames' edges (the edges only, no
text). OG image: the presented-by graphic itself, as `og.jpg` (1024×1024),
exactly as the brief directs ("Use the presented-by graphic for the OG
image"); the carousel graphics 1-6 are never shipped.
`ASSETS.tattooBattleOg` is added to `event-config.ts` so the OG URL has one
home.

Contrast, computed (WCAG relative luminance):

| pair | ratio | use |
|---|---|---|
| `#8B7355` on `#0a0a0a` | 4.41:1 | large text (≥24 px or ≥19 px bold) and decorative only |
| `#8B7355` on `#1a1a1a` | 3.88:1 | large text only |
| `#C4A882` on `#0a0a0a` | 8.74:1 | any text size |
| `#C4A882` on `#1a1a1a` | 7.68:1 | any text size |
| `#999999` on `#0a0a0a` | 6.95:1 | body text, as today |

Rule for the battle pages: small gold text is always `#C4A882`; `#8B7355` is
reserved for display-size headings, rules and borders. Gold on light
backgrounds is avoided entirely: the only light surface is the fist's cream
badge, which carries no text.

---

## 8. Verification plan

- `npm run lint`, `npm run build` (prebuild guards incl. the new
  `BATTLE_START` assertion, which needs the schedule row to exist: it does).
- `npx vitest run` for the pure helpers.
- `node scripts/verify-tattoo-battle-anon.mjs` after Ryan applies 069:
  anon reads 0 drafts, N published; anon insert/update/delete rejected;
  anon storage upload rejected; service-role positive control. Output pasted
  into the report.
- `supabase/verify/verify_069.sql` for Ryan to run: policy list, constraint
  list, one-champion index, RPC behaviour with a fixture that is cleaned up in
  its last block.
- Manual on the built site: bucket 0 and 21 → 404; an unpublished bucket →
  holding state; publish from admin → entry and main page update on the next
  request; two champion attempts → second replaces first.
- Lighthouse accessibility on `/tattoo-battle` and one entry page, target ≥ 95.
- QR: decode each generated SVG with `jsQR` (dev-only) in a script and assert
  it equals `${SITE_URL}/tattoo-battle/entry/${n}` for every n. The boundary
  itself (bucket 1 and bucket `BUCKET_COUNT`) is asserted, not a middle value.

---

## 9. Where the old page and the brief differ

Only for Ryan's awareness; the brief wins unless he says otherwise.

- Old: "lower extremity (arms & legs)". Brief: "lower extremity". Shipping the
  brief's wording.
- Old: tattoos displayed anonymously during voting. Brief: entry page shows
  artist, shop, Instagram. Shipping the brief.
- Old: judges' scoring formula and 50 % weighting. Brief: no formula. Shipping
  the brief.
- Old lines not in the brief, offered only if wanted: "In the event an artist
  cancels, the competition will proceed with the remaining artists"; the
  client's lower extremity "must have a 4×4 free area"; "Additional products
  may be provided to all participants by sponsors".

---

## 10. Out of scope

Online registration; online donations; any vote counting in the platform;
past-champion data entry; the sitemap that `robots.ts` advertises but the app
does not serve (pre-existing gap, noted); moving the battle presenter credit
into `presentation_credits` (HANDOFF §3, unrelated).

---

## 11. Launch checklist (added at Ryan's direction)

Before the printed QR codes are put on buckets:

1. **Domain cutover**: point `www.allamericantattooconvention.com` at the
   `aatc-platform` Vercel project (it is on `aatc-landing` today), keep the apex
   308 to `www.`, and set production `NEXT_PUBLIC_SITE_URL` to
   `https://www.allamericantattooconvention.com`. Until then every scan of a
   printed code 404s on the landing project.
2. Apply migration 069 and run `verify_069.sql`; run
   `scripts/verify-tattoo-battle-anon.mjs` against production.
3. Run the WholeLife spelling seed; re-run `verify_044.sql`.
4. Fill the `tattoo-battle-veteran-ink` page-image slot.
5. Print-preview `/admin/tattoo-battle/print` (Chrome, 4x6 in, 100 %) and
   check one label per page with nothing from the admin shell on it, before
   any labels are printed.
6. Scan one printed code from a phone on the live site and confirm the holding
   state renders for that bucket.

## 12. Report-back checklist (from the brief)

1. Files changed and created: §2.
2. Migration file, not applied: §4.
3. Existing policies found: §1.3.
4. Every `// CONFIRM`: §6, §3.3, §3.10.
5. Candidate old URLs: §1.1.
6. Upload limit and video concerns: §1.3, §3.8, §3.10, §5.2.
7. Issues discovered: the domain is served by `aatc-landing` (§1.1, §3.6, §11);
   the spelling split (§3.2); `robots.txt` on the preview host is correct but
   the production domain has no `sitemap.xml` at all (§10).
