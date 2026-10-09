# 2026-10-09 - Email links that work on any device (/auth/confirm)

Branch `feat/auth-confirm-links`. Ryan's go, 2026-10-09: self-requested
reset and sign-up links failed when requested on a laptop and tapped on a
phone (PKCE: the code only exchanges in the requesting browser), and mail
scanners used links up.

## What changed

- `/auth/confirm` shows a **Continue** button and verifies nothing on load.
- The tap POSTs to `/auth/confirm/verify`, which runs `verifyOtp({ type,
  token_hash })` on the server and sets the session cookie on that device,
  then redirects to the link's destination (same-site paths only).
- A used, expired or made-up token goes to "This link has expired or was
  already used" with Send a new link.
- The Supabase templates (`supabase/templates/*.html`, generated) link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...`
  instead of `{{ .ConfirmationURL }}`.
  - Signup lands on /apply.
  - Reset lands on /auth/reset-password; that page already finds the
    session (#82).

**Ryan pastes the two templates into Supabase AFTER this deploys** (README in
supabase/templates). Old emails keep working through /auth/callback and the
reset page.

## Checked (local server against production auth, throwaway users deleted)

- A recovery link opened twice without tapping (scanner) was not used up.
- Tapping Continue in a fresh browser (the "other device") led to the reset
  form; the new password saved and signing in with it worked.
- The same link tapped again: "expired or already used".
- A signup link: Continue confirmed the email, landed on /apply.
- A made-up token: refused.
- Phone-width screenshot of the Continue page.
- `npm test` 327 PASS (new: auth-confirm, scanner-safe source check;
  templates regenerated).

## Next (Ryan's B, follow-up PR)

Admin Reset password and Invite & link build `/auth/confirm` links from
`generateLink`'s `hashed_token` (`confirmUrl()` is ready for it).
