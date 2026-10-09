# 2026-10-08 - Email auth links after the domain cutover

Branch `fix/reset-link-timeout`. Trigger: a vendor's admin-sent password
reset opened on www and spun forever on "Verifying your reset link..."
(Ryan, iPhone, Mail app).

## Cause (reproduced on the live site, 2026-10-08)

- The browser client (`@supabase/auth-helpers-nextjs` createBrowserClient)
  runs the PKCE flow.
- Links made by the admin API (`generateLink`: admin Reset password in
  /admin/applications, Invite & link, the lifecycle reset link in
  /api/send-email) are not PKCE. Supabase verifies them and redirects with
  the session in the HASH:
  `/auth/reset-password#access_token=...&refresh_token=...&type=recovery`
  (or `type=invite`).
- auth-js in PKCE mode refuses that URL ("Not a valid PKCE flow url."),
  creates no session, and the page had no timeout. **A fresh, never-used link
  spun forever on the live site; it was never domain-specific.**
- A used or expired link (second click, or an email scanner that opened it
  first) lands with `#error=access_denied&error_code=otp_expired`, and also
  spun.
- Redirect host: with www in the allow-list (Ryan, 2026-10-08) the links land
  on www. An unlisted `redirect_to` falls back to the Site URL ROOT (checked),
  so links sent after the cutover but before the allow-list change landed on
  the homepage with their tokens unused.

How it was checked: a throwaway `zz-...@example.com` user (no email sent),
`generate_link`, the verify URL followed once and twice, and the live page
opened in headless Chromium. Every test user was deleted.

## Fix (this branch)

- `src/lib/auth-link.ts` reads what the link left in the URL (tokens / error /
  code / none); unit tested against the exact live redirects.
- `/auth/reset-password`:
  - sets the session from hash tokens with `setSession` (the cookie client,
    so /portal sees it) and clears the tokens from the address bar;
  - an error in the link shows "This link has expired or was already used."
    at once;
  - anything else times out after 10 s with the same message and a
    "Send a new link" button (/auth/forgot-password).
- `/auth/callback` (signup confirmation): Supabase confirms the address
  BEFORE the redirect, so a failed code exchange (link opened in another
  browser) now goes to sign-in with "Your email is confirmed", and a used or
  expired link to sign-in with a sentence. Before, both silently went to
  /apply signed out.

Checked locally against production auth (localhost dev server, real links,
throwaway users deleted after):
- admin reset link: form in 3.4 s, new password saved, lands on /portal,
  sign-in with it OK;
- same link again: the message in 1.2 s;
- no token: the message after 10.7 s;
- invite link: "Create your password" with the form;
- callback with ?error and with a bad code: both go to sign-in with the
  notice.

`npm test` 303 PASS, `npm run build` PASS.

## Not covered / still true

- Self-service links (forgot-password, signup) are PKCE: they work only in
  the browser that requested them. Now they fail with a sentence instead of a
  spinner. Making them work across devices (server-side `token_hash`
  verification) is a separate change, not made here.
- Email scanners that open links still consume them; the page now says so
  instead of spinning.
