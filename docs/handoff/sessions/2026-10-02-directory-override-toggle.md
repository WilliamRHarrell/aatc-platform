# Session 2026-10-02: "Show in directory before deposit" toggle (branch feat/directory-override-toggle)

`applications.directory_override` (032) had no admin control. Ryan set it
for Chop Shop Tattoo by SQL. Read 2026-10-03: approved, needs_roster false,
override true, and Chop Shop is in the anon `applications_public` view. No
booth is assigned yet, so no booth number shows. Its invoice is $200.00,
pending, after the 2026-10-02 SQL.

- New `DirectoryOverrideControl` in the application drawer, for every
  status:
  - a "Show in directory before deposit" checkbox;
  - the note "Lists this exhibitor in the public directory regardless of
    payment, and opens Submit Graphics in their portal. Approval and a
    complete artist roster are still required.";
  - a live line saying whether the exhibitor is listed right now and why.
- **Admin only:** /admin/applications is admin-only in roles.ts, and the 079
  staff clamp resets directory_override on any non-admin write. No
  migration needed.
- The override also unlocks Submit Graphics (graphics-eligibility.ts), which
  is why the note says so.
- `src/lib/directory-listing.ts` mirrors the database rule (approved, roster
  complete, deposit or override) for that status line. Tested.

Checks: build passes; `npm test` 243/243. Not clicked through: the drawer
needs an admin session on production.
