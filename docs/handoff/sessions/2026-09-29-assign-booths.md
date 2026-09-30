# Session 2026-09-29: assign_booths() and Assign Booth fixes (branch fix/assign-booths)

Design: docs/superpowers/plans/2026-09-29-floor-plan-and-booth-map.md (PR 1).

## Delivered, not applied: migration 086 + verify_086
**Apply 086 before merging this PR.** The page now calls
`assign_booths()`. If the page is deployed before the function exists,
Save shows "Booth assignment needs migration 086 applied in Supabase." and
nothing is written.

`assign_booths(p_application_id uuid, p_booth_numbers text[]) returns text[]`:
- security definer, refuses anyone who is not an admin (`is_admin()`,
  42501); EXECUTE revoked from public and anon, granted to authenticated
  (the comp_application pattern, 073).
- One transaction. It locks the application and the booths involved,
  releases what the application is not keeping, then assigns the rest.
- Scoped to the application's own event.
- Refuses:
  - an application that is not approved;
  - an unknown booth number;
  - a booth that is not sellable (the message names its house_use);
  - a booth assigned to another application (the message names it);
  - duplicate numbers;
  - more booths than slots.
- Allows fewer booths than slots, so a partial assignment still saves.
- An empty list releases every booth.
- No policy changes. verify_086 A asserts the live booths policies are
  still the three from 042/043/075.

verify_086 B runs entirely in an inactive "ZZ VERIFY 086" event with its own
booths and deletes it afterwards. It asserts the active event's booths are
unchanged, so it is safe to run while real booths are being assigned.

**Run before delivery:** 086 and verify_086 were executed in PGlite (Postgres
17 WASM) against a minimal copy of the schema (events, profiles,
applications, booths, the three policies, is_admin, auth.uid), 2026-09-29.
- All blocks passed. Fixtures were removed, and the stand-in live event's
  booths were unchanged.
- Negative controls:
  - with the not-sellable check deleted, verify_086 failed at B5;
  - with event scoping deleted from the assign update, it failed at B2.

## App changes
- /admin/booths/[id] Save calls `assign_booths()`. It no longer runs a set
  of browser-side updates across every event's booths. Afterwards it reads
  the application's booths back from the database. The saving state always
  resets; one error path used to leave it stuck.
- **Corner warning:** it now also fires for 2027 applications, which record
  corners in `corner_count`. Before, it read only the 2026 `is_corner`
  field, so a 2027 corner purchase never triggered it. It is still only a
  confirm(), as before.
- /admin/booths:
  - The application and booth reads are filtered to the active event.
  - The grid sorts numerically ('2' before '10').
  - Not-sellable booths are struck through and dashed, with the house use on
    hover.
  - The subtitle counts from the data (it used to say "267 booths").
- `src/types/database.ts` gains `booths.is_sellable` and `house_use` (from
  042, never added) and the `assign_booths` rpc type.

## Not sellable
108, 241, 166 and 233 stay not sellable (Ryan, 2026-09-29), pending his
confirmation of the 2027 list and the 165/166 labelling. To sell one: Ryan
confirms, then run
`update booths set is_sellable = true, house_use = null where booth_number =
'N' and event_id = (select id from events where is_active);`.
Every other booth assigns as before. **For open-items (docs refresh):** this
confirmation is outstanding.

## Still unscoped by event (next-year rollover, not this PR)
/admin/print, /directory and /directory/[id] read booths and applications
without an event filter. They are harmless while only 2027 has booths, and
need fixing before a 2028 seed. **For open-items.**

Checks: `npm run build` passes; `npm test` 211/211 (new
`src/lib/booth-slots.test.ts`: the SQL slot rule matches boothSlotCount, and
the page never updates booths rows directly).
