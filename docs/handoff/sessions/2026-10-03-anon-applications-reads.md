# Session 2026-10-03: dashboard directory funnel, anon reads (branch fix/anon-applications-reads)

- **Bug:** the admin dashboard's "Public Directory Funnel" showed "permission
  denied for table applications". `/api/admin/directory-health` measured
  `visible` with a genuinely anonymous client against the applications
  table, and anon has had no grant on that table since 075.
- **Fix:** the anonymous count reads `applications_public`, the view the
  directory pages use (approved, roster complete, deposit or override). It
  is still a real anonymous measurement, which is the point of that number.
  A test pins it.
- **Read live, 2026-10-03:** the old read gives 42501 (reproduced); the new
  read lists 3 (Chop Shop, Jane Ink, Skin Reserve), which equals expected 3
  (2 deposit, 1 override). The funnel will show healthy.
- **Audit of other `applications` reads outside admin/portal:** apply forms
  (applicant session), create-checkout (owner session), send-email,
  import-returning, the cron and application-submitted (service role or
  owner). None is anonymous; directory-health was the only anonymous one.

## "Mark ID verified" (088) - where it is
- It is on `/admin/booths/<application id>`: each "Artist N" card header,
  next to "View ID". It shows only when that artist has an uploaded ID.
  Verified artists show "ID verified (date)" and "Unverify".
- That page was only linked from the /admin/booths list, which lists only
  exhibitors with a deposit recorded, so Chop Shop (no deposit) had no link.
- The application drawer now links approved applications straight to it:
  "Exhibitor page: artists, ID verification, booths".
- Chop Shop (read 2026-10-03): 4 artists, IDs on 1-3, none on 4.

Checks: build passes; `npm test` 244/244.
