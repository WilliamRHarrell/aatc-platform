# Session 2026-10-02: artist capacity, roster guard, artist ID verification (branch feat/roster-guard-capacity)

PR 1 of the "Add an artist" build order. Ryan's decisions (2026-10-02):
- Capacity is 2 artists per single (10x10) and 4 per double: the county
  permits at most 2 per 10x10.
- Swaps are free until the permit submission date (March 1, 2027), then cost
  a new $50 permit with the old fee forfeited.
- Comps are split into "Comp booth" and "Comp permits".
- Pay after approval.
- After March 1, exhibitors can only "Request a change".
- Emails as proposed.

## Delivered, not applied: migration 088 + verify_088
**Apply 088, then run verify_088.sql, then verify_079_matrix.sql
(regenerated), before merging.** The admin "Mark ID verified" button needs
088; it says so if 088 is missing.

1. **Capacity:**
   - The `applications_artist_capacity` CHECK: artist rows need artist_count
     <= 2 per single + 4 per double (2026 booth_size rows: 2 per 10x10
     slot).
   - No existing row exceeds it (all 4 applications read 2026-10-02).
   - `application_list_price` is replaced with permits capped at the same
     rule; it was 4 per booth of any size. 079 is not edited.
2. **Roster guard** (`applications_roster_guard_trg`, BEFORE INSERT/UPDATE
   of artists, artist_count, running after the 079 staff clamp):
   - Nobody, admin included, can store more artists than artist_count.
     That closes the hole where an exhibitor could append artists through
     the API.
   - Verification keys (`artists[].id_verified_at/by`) are written only by
     `set_artist_id_verified()`. On any other write the trigger strips them
     and carries them forward from the old entry with the same id_url, so a
     stale admin page cannot drop them, a client cannot forge them, and a
     replaced ID clears them.
   - An exhibitor cannot rename, re-ID or remove a verified artist (the
     silent-swap hole). Styles, nickname and portfolio stay editable.
3. **`set_artist_id_verified(application, index, verified)`:** admin only,
   requires an uploaded ID, records who and when. EXECUTE goes to
   authenticated with an internal admin check; anon is revoked.

**Local runs (`npm run verify:local`, 88 migrations replayed):**
- verify_088 (A, B1-B10), the regenerated matrix (25 cases), and
  verify_086/087 all PASS. `--audit`: 106 inserts, 0 missing.
- **Negative controls:**
  - without the verification stripping, verify_088 fails at B10;
  - without the owner lock, it fails at B7;
  - without 088 at all, the matrix fails on the over-cap case.

## Code
- `pricing.ts`: permits are capped by `getMaxArtists` (2/4), which is now
  the documented single home of the rule.
- `src/lib/artist-roster.ts` (tested): `artistCapacity()` (including 2026
  booth_size rows) and `isIdVerified()`.
- **Admin `/admin/booths/[id]`:** per-artist "Mark ID verified" / "ID
  verified (date)" / "Unverify". The roster is re-read after saves.
  "Artists: N of M".
- **Admin applications drawer:** "Artists: N of M".
- **Portal Artist Roster:** "N of M artist permits · 2 per single booth, 4
  per double". A verified artist shows "ID verified", and its name and ID
  are locked with a "contact us" note. The roster guard's own message is
  shown when it refuses.
- **New `pricing-sql.test.ts`:** runs verify_079_matrix.sql against the
  replayed application_list_price on every `npm test`, so pricing.ts and
  the SQL cannot drift unnoticed.
- The matrix gains the over-cap cases (single + 3 artists, double + 5,
  2 singles + 1 double + 9). The "8 artists on single + double" case is
  now 6 permits.

## Chop Shop Tattoo invoice (Ryan runs it)
`supabase/seeds/chopshop_invoice_2026_10_02.sql`: invoice 98d827cb $225.00
-> $200.00, still pending.
- Guarded: it only matches if the invoice is $225.00 with nothing paid, no
  milestones and no Stripe payment; otherwise it aborts with nothing
  changed.
- Read first (2026-10-02): amount_paid 0, pending, no payment intent, and
  no Stripe Checkout session for it (live list of the last 100 sessions).
- Tested on the replay: the first run sets $200.00; a second run aborts.
- Becomes "Comp booth, permits charged" when the comp split lands.

Checks: `npm run build` passes; `npm test` 240/240.
