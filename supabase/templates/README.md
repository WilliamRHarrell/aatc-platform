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
The admin's reset tool and the returning-exhibitor invite generate their links
server-side and send them through the app's own Resend templates instead.

`{{ .ConfirmationURL }}` is Supabase's variable; keep it exactly as written.

After saving: create a throwaway signup and use Forgot password once, and
confirm both arrive branded, from the Resend sender, with a working link.
