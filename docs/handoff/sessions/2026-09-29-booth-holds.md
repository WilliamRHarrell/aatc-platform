# Session 2026-09-29: booth holds (branch feat/booth-holds)

Design: docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md (PR 2).
Ryan's rules (2026-09-29):
- Every hold has an end (held_until is required).
- Expired holds release automatically.
- assign_booths refuses a booth under an active hold, except for the
  application the hold is linked to.

## Delivered, not applied: migration 087 + verify_087
**Apply 087 before merging.** Until it is applied, the hold dialog shows
"Booth holds need migration 087 applied in Supabase." and the booth reads
fail on the new columns.

- **Columns on booths:** held_for (a name), held_for_application_id or
  held_for_sponsorship_id (at most one; `on delete set null`), held_until,
  held_by, held_at.
- **Constraints:**
  - a hold is all or nothing, with a non-blank name and an end;
  - at most one link;
  - an assigned booth cannot be held.
- **Active hold** = `held_for is not null and held_until > now()`. Every
  reader uses that rule, so a hold stops counting the moment it ends.
- **Functions:**
  - `hold_booth(booth, held_for, held_until, application?, sponsorship?)`:
    admin only. Refuses a blank name, an end in the past, two links, a
    not-sellable booth, an assigned booth, and a link from another event.
    Setting a hold on a held booth replaces it.
  - `release_booth_hold(booth)`: admin only.
  - `release_expired_booth_holds()`: service_role only. The lifecycle-sweep
    cron calls it every run, before the kill switch; it is tidy-up and not
    destructive. The dry run reports `booth_holds.would_clear`.
  - `assign_booths()` is replaced (086 is not edited):
    - it refuses a booth under an active hold unless
      held_for_application_id is the application being assigned;
    - the message names the hold and its end date (ET);
    - assigning a booth clears its hold (this application's, or an expired
      one).
  - Grants: hold_booth and release_booth_hold to authenticated with an
    internal admin check; release_expired to service_role;
    assign_booths's grants are restated.
- No policy changes. verify_087 A re-asserts the three booths policies.
- verify_087 B uses an inactive ZZ event with its own booths, applications
  and a sponsorship. It asserts that the active event's assignments are
  unchanged.

**Run before delivery (PGlite, minimal schema, 2026-09-29):** 086, then 087,
then verify_087, then verify_086 (still passing on 087's assign_booths): all
passed and the fixtures were removed. **Negative control:** with the
active-hold check removed from assign_booths, verify_087 fails at B4.

## App
- **/admin/booths grid:**
  - An open or held booth is a button. Clicking it opens BoothHoldDialog:
    set, change or release a hold, with who it is for, an optional link to
    this event's application (pending, approved or waitlisted) or
    sponsorship, and an end time in the admin's local time (default 7 days
    out, 23:59).
  - Held booths are amber, with the name and end (ET) on hover.
  - The subtitle counts held booths.
- **/admin/booths/[id]:** it lists booths held for this exhibitor above the
  slot inputs ("Assigning it here uses the hold"). Refusals come from
  assign_booths, which names the hold.
- **Cron:** `booth_holds` appears in every lifecycle-sweep response.
- `src/lib/booth-holds.ts` (activeHold, labels) is tested.
  `booth-slots.test.ts` now reads the latest migration that defines
  assign_booths (087) and asserts the hold check.

Checks: `npm run build` passes; `npm test` 225/225.
**Not exercised in the UI:** the local app uses the production database,
where 087 is not applied. After applying it:
- hold a booth;
- try to assign it to another exhibitor (it should be refused, naming the
  hold);
- assign it to the linked exhibitor (it should succeed and the hold clears);
- release a hold.
