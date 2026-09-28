# Session 2026-09-28: newsletter contacts created in GHL without the tag

**Report (Ryan, 2026-09-28 ~11:13 ET):** production signup
ryan+test26@ryanharrell.com created the GHL contact with NO tags.

**Logs (vercel logs, production):** one `POST /api/newsletter` at 11:13:02 ET,
status 200, no log lines. In #37's code that means BOTH GHL calls returned
2xx: the add-tags call was accepted but did not tag. Its body was not logged
(the route logged only failures), so the exact response is unknown.

**Fix (branch fix/newsletter-tags):**
- New contact (upsert `new: true`): the tag goes in a second upsert. Safe (a
  brand-new contact has no tags to overwrite) and uses the call that works.
- Existing contact: add-tags as before, but it counts as applied only if
  "newsletter" is in the tags GHL returns. A 2xx alone is not trusted.
- Every signup logs one line: `tagged via <call> <status>`, or an ERROR with
  GHL's status and body when the tag did not apply. No token, no email.
  The visitor still sees success when the contact was saved.
- `GET /api/admin/newsletter-test?email=...` (admin only): real signup through
  the same code, every GHL step (status + body), and the contact's tags read
  back. `&version=v3` tries GHL's newer Version header for that run only.
  Read-back needs `contacts.readonly` on the token (not yet granted).
- YouTube added to SOCIAL and the footer.

**Not established:** WHY add-tags returned 2xx without tagging. The admin
test's `steps` will show its body the first time it runs on an existing
contact (e.g. re-run it with ryan+test26).
