# Application editor and VIP Meet & Greet featured artists

Ryan's plan and decisions, 2026-10-09, recorded so a fresh session can
continue. **Status: COMPLETE (2026-10-09).** Editor PR 1 #98 (096), PR 2
#100, TV per artist #101, PR 3 #102, 097 fix #103, Add A Booth retired
#104, VIP #105 (098), Featured badge and homepage #106 (099); every
migration applied and verified. The order below was changed by Ryan: PR 3
moved ahead of VIP. Remaining: the homepage switch, once 3 artists are
featured (START HERE, "Waiting").

## Order (Ryan)

1. **Editor PR 2:** the form.
2. **VIP Meet & Greet** featured artists.
3. **Editor PR 3:** "Edit everything" on any application.
4. **Directory "Featured" badge and homepage "Featured artists" section.**

## Decisions (Ryan, 2026-10-09)

- **a. Status.** A new application chooses its status: **pending (default)**
  or approved. Ryan keeps recruits pending until they confirm, so
  VIP-checked artists only go public once he approves them.
- **b. Custom total below list** needs the same second confirmation as a
  large discount (#64).
- **Custom total above list** is allowed with no confirmation.
- **The custom total is stored in `applications.agreed_total`** (Option 1,
  migration 096). Approve invoices it; `total_amount` stays the list price.
- **c. Bio.** An optional per-artist bio, public on the directory and the
  VIP page.
- **d. Add A Booth** (`/admin/booths`) retires once the editor is live. Its
  deposit bug is already fixed (#96).
- **e. Photo.** A per-artist photo, uploaded by admin, falling back to the
  artist's first portfolio image.
- **f. TV credit.** A per-artist TV credit, falling back to the
  application's `tv_show` only when the roster has a single artist.
- **Money choices:** standard price, custom total, comp booth, or comp
  booth + permits (the existing comp split, `set_comp()`, 089).
- **No account is required.** Invite & link (now through `/auth/confirm`)
  gives the person access later.
- **Rules to respect:**
  - one active application per person per event;
  - the 2 per single / 4 per double artist cap;
  - permit pricing;
  - `needs_roster` and the directory rules.

## Already built (editor PR 1, #98)

- **`src/lib/admin-application.ts` `planApplication(input)`:**
  - validation, and the list price from `calculatePricing`;
  - booths of the exhibitor's own type; the cap (`artistCapacity`); the
    roster no longer than `artist_count`;
  - `needs_roster` until every artist has an ID or "ID later";
  - the four money choices;
  - per-artist keys kept in `applications.artists`: `name, nickname,
    instagram, styles, bio, photo_url, tv_credit, portfolio_urls, id_url,
    id_later`.

  Tested in `admin-application.test.ts`.
- **`POST /api/admin/applications/editor`** (admin only; runs as the admin
  so every trigger sees an admin). Body `{ id?, input }`.
  - Duplicate check: email plus event plus active status. Rows with no
    account are outside 079's index.
  - Create (`user_id` null) or update. A paid invoice freezes the price.
  - `set_comp()` for comps. The 079 insert clamp clears `comped_at` even
    for admins, so the comp is always applied after the insert.
  - `approved` writes `approvePayload` and creates or re-prices the invoice;
    `pending` writes `SEND_BACK_PAYLOAD`.
  - No email is sent.
  - Returns `{ id, created, problems }`, or `409 { needsConfirm }` for a
    custom total below list.
  - **Not yet run end to end:** it needs a signed-in admin. Test it through
    PR 2's form with Ryan's account.
- **Drawer Approve** honours `agreed_total`: the discount box is hidden and
  the summary reads "(agreed total; list $Y)".

## Editor PR 2: the form (next)

- **Where:** a new admin page, e.g. `/admin/applications/new`, with a "New
  application" button on `/admin/applications`. PR 3 reuses the same form
  for any existing application.
- **Fields:** the public artist/vendor forms' fields, plus per-artist bio,
  photo and TV credit.
  - Contact: business/shop, contact, email, phone, website, Instagram,
    Facebook, other links, notes.
  - Booth: singles/doubles, corners, add-ons (`addOnOptions()`), veteran.
  - Artist count and the roster.
  - Logo; TV show Yes/No plus name (094 `tv_show_featured`).
  - Money choice and status.
- **Upload order:** files need the application id, so save first (create),
  then upload, then save again with the URLs.
  - **IDs:** private `application-docs` at `admin/<application id>/...` (the
    existing admin pattern on the booth page). Verify with
    `set_artist_id_verified()` (088).
  - **Portfolio:** `exhibitor-media/<application id>/artists/<i>/...`
    (public URLs).
  - **Photo:** e.g. `exhibitor-media/<application id>/artists/<i>/photo-...`.
  - **Logo:** `exhibitor-media/<application id>/logo.<ext>`.
- **Below-list confirmation:** on `needsConfirm`, show the warning and
  resend with `confirmedBelowList: true`.
- **After this ships:** remove "Add A Booth" from `/admin/booths`
  (decision d).
- **Test live** with Ryan's admin account. Use a ZZ-named entry, then
  delete it.

## VIP Meet & Greet featured artists (after PR 2)

**Requirements (Ryan):**
- A per-ARTIST checkbox in admin: "Attending Gold Star VIP Meet & Greet".
- `/events/vip-meet-greet` lists checked artists: photo, artist name, shop,
  Instagram, TV credit if any. Public fields only, never contact or ID
  information.
- Only approved applications show. Sending an application back to pending
  drops its artists automatically.
- Admin sets the display order.

**Why not a flag inside `applications.artists` (survey, 2026-10-09):**
- There is **no stable per-artist id**; identity is the array index
  (storage paths `artists/<i>`, `set_artist_id_verified(p_index)`).
- `src/components/portal/RosterCompletionPanel.tsx` **rebuilds the array
  from scratch**, dropping unknown keys.
- `applications_public` publishes every artist key except `id_url`,
  `id_verified_at` and `id_verified_by`.
- An owner could set a flag on themselves: 088's guard preserves unknown
  keys.

**Plan (one migration):**
1. **A stable artist id.** Each roster element gets a permanent `uid`,
   assigned by a trigger when missing (backfill existing rows) and preserved
   through edits. Fix `RosterCompletionPanel` to carry it, and add `uid` to
   `EditorArtist` and `planApplication`.
2. **The table.** `vip_featured_artists` (`application_id` with
   `on delete cascade`, `artist_uid`, `display_order`, `created_by`,
   `created_at`). Admin-only RLS; owners cannot touch it.
3. **The public view.** It joins approved applications only and returns
   only public fields: photo (`photo_url`, else the first portfolio image),
   artist name (nickname or name), shop (`business_name`), Instagram, TV
   credit (`tv_credit`, else `tv_show` when the roster has one artist).
   Sending back to pending removes the row from the view automatically.
4. **Admin.** The checkbox per artist (editor and booth page), and an
   ordering list.
5. **The page.** `/events/vip-meet-greet` reads the view and removes the
   three "Artist Announcement Coming Soon" placeholders
   (`FEATURED_ARTISTS`). The section hides when empty.

## Editor PR 3: "Edit everything" (after VIP)

- Open any application, in any status, in the PR 2 form. Uses the same
  route's update path.
- Changing booths or add-ons re-prices only an unpaid invoice. Once money
  is paid, it refuses with a message.
- Replaces the booth detail page's partial edits. That page is
  approved-only today and cannot add or remove artists or edit contacts,
  booths or add-ons.

## Featured badge and homepage (last)

- **Directory "Featured" badge:** on the artist card and profile, from the
  VIP view.
- **Homepage "Featured artists" section:** from the same view, behind a
  content-editor on/off switch, and **shown only when at least 3 artists
  are checked.**
- **Pattern to copy:** sponsors' `show_on_homepage` / `homepage_order`
  (`src/app/page.tsx` ~103-166, `unstable_cache` with tags).

## House rules that apply

- Migrations are delivered, not applied (Ryan applies).
- Run `npm run verify:local -- supabase/verify/verify_NNN.sql` and
  `--audit` first; mutation-test each verify.
- Enumerate existing policies in the migration header.
- No stacked PRs.
- Don't invent content.
