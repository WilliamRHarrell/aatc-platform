# Session 2026-09-26: protected records (migration 082)

**Delivered, NOT APPLIED.** Branch `feat/protected-records`.

- `is_protected` on applications and sponsorships. A protected row cannot be
  deleted - directly, or by cascade from its event or its OWNER ACCOUNT
  (applications.user_id is ON DELETE CASCADE from auth.users, so deleting the
  account fails as a whole). Its invoices and exhibitor rows cannot be deleted
  either (teardowns delete children first). Error: restrict_violation.
- The flag changes only in SQL / service role; any app session (admin
  included) is refused, and an app insert cannot create a protected row.
- Updates are NOT blocked: a protected booth can still be edited, released,
  comped or uncomped in the admin.
- Admin: "Protected" badge on the application drawer and the sponsorship
  list; deleting a protected sponsor says why.
- Seed `protect_2026_09_26.sql`: Skin Reserve application 13c265d7 (owner
  ryan@skinreserve.com), its in-kind sponsorship 3c393126, and The Pinback
  Button Club application 44c185e8 (owner email on file, comped).
  Matched by id, trimmed name and owner.

**Order:** merge, apply 082, run `protect_2026_09_26.sql`, paste
`verify_082.sql` (its grid C should list 2 applications and 1 sponsorship).
verify_082 never touches a real row or auth.users: it proves the cascade
path with a throwaway event.
