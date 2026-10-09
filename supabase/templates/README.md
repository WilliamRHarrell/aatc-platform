# Supabase Auth email templates

GENERATED from `src/lib/email-templates.ts` (`authConfirmSignupEmail`,
`authResetPasswordEmail`) so the auth emails share the site's email branding.
Do not edit the HTML here; change the generator and run:

    WRITE_AUTH_TEMPLATES=1 npx vitest run src/lib/auth-email-templates.test.ts

`npm test` fails while a file here is stale.

## Installing (Supabase dashboard; there is no CLI in this project)

Authentication -> Email Templates. For each template, set the subject and
paste the whole file into the body (Source / HTML view):

| Template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your AATC 2027 account | `confirm_signup.html` |
| Reset password | Reset your AATC 2027 password | `reset_password.html` |

These are the only two Supabase-sent emails the app triggers (`/auth/signup`
and `/auth/forgot-password`). Magic link, invite and change-email are not used.
The admin's reset tool and Invite & link generate their links server-side and
send them through the app's own Resend templates instead.

The links use Supabase's `{{ .SiteURL }}` and `{{ .TokenHash }}` variables
(keep them exactly as written) and point at `/auth/confirm`, which verifies
on a "Continue" tap, on any device (2026-10-09; `src/lib/auth-confirm.ts`).
They no longer use `{{ .ConfirmationURL }}`, a PKCE link that only worked in
the browser that asked for it and was used up by mail scanners.

**Paste these only after `/auth/confirm` is live on www** (the PR that added
it has deployed). Pasted earlier, every new email link would 404. Emails sent
with the old template keep working: `/auth/callback` and the reset page still
handle them.

After saving: create a throwaway signup and use Forgot password once, and
confirm both arrive branded, from the Resend sender, with a working link.
