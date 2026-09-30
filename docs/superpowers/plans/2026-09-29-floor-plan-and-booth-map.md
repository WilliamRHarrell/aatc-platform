# Floor Plan, Booth Holds and Booth Map: Design Note

> Design only. Nothing here is built. Each stage is its own PR, based on
> `develop`, and each is reported before building (CLAUDE.md). Written
> 2026-09-29 from Ryan's brief and his answers the same day.

## Decisions (Ryan, 2026-09-29)

- **Order:**
  1. Assign Booth fixes (`assign_booths` function)
  2. Booth holds
  3. Stage 1: upload and display the plan
  4. Booth positions: extraction and placement mode
  5. Stage 2: admin map
  6. Later: public map

  Holds go second because Ryan is selling booths now, and the assign function
  has to know about them. Reorder if needed.
- **The floor plan does not change year to year.** Plan data and booth
  positions are not tied to an event.
- **Booth holds: yes.**
  - `held_for` is a free-text name, optionally linked to an application or a
    sponsorship.
  - `held_until` sets when the hold ends; it expires automatically after that.
  - An admin sets and clears holds.
  - Amber on the map.
- **Public floor plan page: off at launch** (`show_public` defaults to false).
- **/apply step 3:** the floor plan clause was removed (PR #54). **Restore
  it when Stage 1 ships.**
- **Not sellable stays 108, 241, 166, 233 for now.**
  - Ryan confirms the 2027 list and the 165/166 labelling later.
  - If he needs one of those four for sale, he confirms first.
  - No fix may block assigning any other booth.

## How booths work today (checked 2026-09-29: production data and code)

- **Rows:** 267 for the active 2027 event, `booth_number` '1' to '267'
  (text, integers only), `unique (event_id, booth_number)`. Seeded fresh per
  event by migration 020 (`generate_series`), with nothing carried forward.
- **Size:** every row is `size = single`, and no code reads `booths.size`.
  A double is two rows linked to one application
  (`src/lib/booth-display.ts` `boothSlotCount`). Adjacency is never checked.
- **Corners:** 72 are marked, from a hardcoded list in 020.
- **Sellable:** 042 added `is_sellable` and `house_use`.
  - 108 is the Help Desk and 241 is Merch & Contest Registration.
  - 166 and 233 are marked "does not exist on the floor plan".
  - These came from the 2024 plan (the 2024 plan had 265 real booths, a
    mislabelled 165/166, and no 233).
- **Status:** `booth_status` is available / reserved / sold.
  - `reserved` = assigned.
  - `sold` is never written.
  - Every row is `available` with `application_id` null today.
- **Geometry:** `x`, `y`, `width` and `height` exist, but every row is
  0, 0, 1×1 (CUTOVER.md "No floor plan geometry").
- **No booth hold exists.** Holds exist only for sponsorships (037) and
  panel seats (080).
- **Who can be assigned:** `partitionAssignable` (src/lib/comp.ts) lists
  approved applications with a deposit recorded. Comping records a deposit,
  so comped applications qualify.
- **Assign Booth** (`src/app/admin/booths/[id]/page.tsx` `saveBoothAssignment`)
  is a set of client-side writes, not one transaction:
  - It fetches **all** booths with **no event filter** and matches the typed
    numbers in the browser.
  - It refuses a booth that another application holds.
  - Corners get a `confirm()` warning only.
  - It clears this application's booths, then updates each chosen booth to
    `{application_id, status: 'reserved'}`.
  - It does **not** check `is_sellable` (the Help Desk can be assigned).
  - It does **not** check that the count typed equals the slot count.
- **Floor Plan Grid** (`src/app/admin/booths/page.tsx`): a wrapped list of
  squares with no event filter. It sorts booth numbers as text ('1', '10',
  '100'), ignores sellable and payment state, and hardcodes "267 booths".
- **Portal:** the Booth Assignment card shows the exhibitor's booth numbers
  (043 "booths: own read").
- **Public directory:** a booth is public when `booth_publicly_visible()` is
  true (approved, roster complete, and a deposit paid or `directory_override`),
  it is sellable, and it is assigned (042 policy).

## PR 1: `assign_booths` function and Assign Booth fixes (live bug, first)

Migration `086_assign_booths.sql` plus `verify_086.sql`. **Apply 086 before
merging:** the page calls the function, so merging first would break
assigning.

`assign_booths(p_application_id uuid, p_booth_numbers text[]) returns table(booth_number text)`:
- `security definer`, `set search_path = ''`. Refuses unless `is_admin()`.
  EXECUTE is revoked from PUBLIC and anon, per the 073 grant audit.
- **One transaction:**
  1. Lock the application's current booths and the target booths
     (`for update`).
  2. Clear the application's current booths.
  3. Assign the targets.
- **Scoped to the application's event** (`applications.event_id`), not to
  every event.
- **Refuses, with a clear message:**
  - an application that isn't approved;
  - a number that doesn't exist for that event;
  - a booth held by another application;
  - a duplicate number in the input;
  - **more** booths than `boothSlotCount(app)`. Fewer are allowed, so a
    partial assignment (one half of a double now) still saves, and the page
    marks it incomplete. The count is computed in SQL from the same qty
    columns; a test keeps the two in step.
- **`is_sellable = false` is refused**, which is the rule 042 intended. It
  only affects 108, 241, 166 and 233. When Ryan confirms he needs one of
  those, the fix is flipping that booth's `is_sellable`, not weakening the
  function.
- **Holds** (after PR 2): a booth actively held for a different application
  or sponsorship is refused unless `p_override_hold`. The page asks for
  confirmation first.
- The corner warning stays in the page, as it is today.

Page changes:
- Save calls the function.
- Every booth query on /admin/booths is filtered to the active event.
- The grid sorts numerically, greys out not-sellable booths with their
  `house_use`, and counts from the data.

Before building: read `pg_policies` for `booths` (rules.md).

## PR 2: Booth holds

Columns on `booths`:

| Column | Type | Notes |
|---|---|---|
| `held_for` | text | required when held: the name shown on the map and in Assign Booth |
| `held_for_application_id` | uuid, FK applications, `on delete set null` | optional link |
| `held_for_sponsorship_id` | uuid, FK sponsorships, `on delete set null` | optional link; a check allows at most one of the two links |
| `held_until` | timestamptz | required when held |
| `held_by`, `held_at` | uuid, timestamptz | who set it, and when |

- **Active hold:** `held_for is not null and held_until > now()`.
- **Expiry needs no cron.** Every reader applies that rule.
- The existing lifecycle-sweep cron also clears expired rows for tidiness.
- **Rules:**
  - A booth that is assigned cannot be held.
  - Assigning a booth to the application it is held for clears the hold.
- **Admin action:**
  - "Hold booth" on the booth, with a name, an optional application or
    sponsorship picker, and an until date.
  - "Release hold" clears it.
  - Both go through a `hold_booth` / `release_booth_hold` function, which
    uses the same admin check and grants as `assign_booths`.
- **Needs deciding when building:** held_until is required here. Say if
  holds with no end date are wanted.

## PR 3: Stage 1, upload and display

**Storage:** a new private bucket, `floor-plans` (PDF, PNG, JPEG, WebP; no
SVG, because SVG can carry script).
- The verify reads its policies from `pg_policies`.
- Uploads are exercised through the Storage API
  (`scripts/verify-graphics-owner.mjs` pattern), never by writing storage
  tables.

**Table `floor_plans`:**
- `original_path`, `image_path`, `image_width`, `image_height`
- `is_current` (unique partial index: only one current), `show_public`
  (default false)
- `uploaded_by`, `uploaded_at`, `note`
- No `event_id`.

**PDF handling:** the admin upload page renders page 1 to a high-resolution
PNG in the browser (pdf.js, loaded only on that page) and uploads both. The
site shows the PNG and offers the PDF as a download. There is no server-side
PDF work.

**Serving:** a route handler signs short-lived URLs for:
- admins;
- exhibitors with an approved application (portal);
- anyone, only when `show_public` is true.

**Surfaces:**
- **/admin/floor-plan:** upload, preview, set as current, and the
  `show_public` toggle.
- **Portal:** a "Floor plan" card with zoom and a PDF download.
- **/floorplan:** 404 unless `show_public`. When it is turned on, add it to
  `ROUTES`, the nav, the footer and the sitemap in that PR.

Restore the /apply step 3 floor plan clause in this PR.

## PR 4: Booth positions, extraction and placement mode

**Table `booth_positions`:** `floor_plan_id`, `booth_number`, `x`, `y`, `w`,
`h` (fractions 0–1 of the plan image), `rotation` (0/90/180/270), with
primary key `(floor_plan_id, booth_number)`.
- It joins to the active event's booths by number, so positions survive the
  per-event re-seed and any change of image resolution.
- `booths.x`/`y`/`width`/`height` stay unused, and get a column comment
  saying so.

**Automatic extraction** is realistic when the PDF is vector with real text
(the 2026-08-13 session extracted coordinates from the 2024 venue PDF). A
one-off script uses pdf.js `getTextContent()`:
- keep text items that are the integers 1–267;
- drop dimensions, row labels and duplicates;
- place a standard booth-sized box on each number;
- write candidate positions for review.

Booth outlines in the drawing are not needed, since every booth is single.
It does not work on a scan, or where the numbers were converted to outlines.

**Placement mode** (admin; needed either way to review and correct):
- Draw one booth to set the standard size.
- Each click then stamps a box, and the booth number moves on to the next
  unplaced one.
- Drag, resize, arrow-key nudge, rotate 90°.
- A "placed / sellable" counter and a list of unplaced booths.
- By hand, about 20–40 minutes for 263 booths.
- A double's adjacency can be warned about once positions exist.

**What we need from Ryan:** the current plan as an original **vector PDF**
(CAD or Illustrator export, one page, booth numbers as real text, not a scan
or screenshot). If only a raster exists: PNG or JPG at least 4000px on the
long side.

## PR 5: Stage 2, admin booth map

**Layout:** on /admin/booths, a Map view:
- The current plan image, with an SVG overlay whose viewBox is the image
  size, and one clickable shape per positioned booth.
- Zoom and pan (pinch on a phone).
- Search for an exhibitor highlights their booths.
- A legend shows a count per state.

**Clicking a booth** opens a panel with the booth number, corner,
sellable / `house_use`, the exhibitor, the invoice state and any hold, plus:
- "Open in Assign Booth" (`/admin/booths/[appId]`) for an assigned booth;
- "Assign to…" for an open booth, which opens Assign Booth with that number
  filled in;
- hold / release hold.

The map never writes an assignment itself: `assign_booths` is the only write
path.

**Status and color:** one tested function, first match wins, drawn with a
letter or pattern as well as color:

| State | Rule | Color |
|---|---|---|
| House / not sellable | `is_sellable = false` | grey, hatched, `house_use` label |
| Comped | assigned application with `comped_at` set | gold |
| Paid in full | invoice `final_paid_at` set | dark green |
| Deposit paid | invoice `deposit_paid_at` set | green |
| Assigned, no deposit | assigned, none of the above (possible after un-comping an assigned application) | red outline |
| Held | active hold (PR 2) | amber |
| Open | sellable, unassigned, not held | outline only |

"Assigned" and "deposit paid" are the same set today, because only
applications with a recorded deposit can be assigned. So the map splits
deposit-paid from paid-in-full instead.

**Portal bonus:** highlight the exhibitor's own booths on their floor plan
card.

## Later: public booth map (design only)

- A public view exposing only `booth_number`, the position, and a coarse
  state: open, sold or house. No payment detail and no holds (held shows as
  open, or as sold if Ryan prefers).
- Exhibitor names appear only when an admin `show_exhibitor_names` switch is
  on. Even then, only for booths that already meet the directory rule
  (`booth_publicly_visible()`, sellable, assigned).

## Open items for Ryan

- Confirm the 2027 not-sellable list (108, 241, 166, 233) and the 165/166
  labelling.
- Send the current floor plan (vector PDF preferred).
- Holds: is held_until always required (current assumption)?
