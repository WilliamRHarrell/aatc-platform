# Session 2026-09-28: Invite & link (sponsorships and in-person applications)

**Delivered.** Branch `feat/invite-and-link`. No migration.

## Decision reversed (Ryan, 2026-09-28)

`/api/admin/link-sponsor` deliberately never created accounts ("minting a
login the sponsor never asked for"); the account had to exist first. **Ryan
reversed this on purpose:** an admin may now create an account by invitation
for the address they type. The account is created in an invited state, linked
at once, and usable only by whoever opens the emailed link. link-sponsor is
deleted; `/api/admin/invite-link` replaces it.

Also Ryan's calls: an existing account gets a short branded "your
sponsorship/application is now in your portal" email when linked; admins and
sponsorship managers may invite on sponsorships, admins only on applications.

## What it does

- `src/lib/invite-link.ts` (rules, tested) and `/api/admin/invite-link`:
  - account with that email that has been used: link + "now in your portal";
  - invited but never used: link + a fresh set-password link (resend);
  - no account: Supabase `generateLink('invite')` (sends nothing itself),
    link, then our branded invite (`accountInviteEmail`);
  - row linked to a different account: refused, unlink first;
  - application: refused if that account already has another active
    application for the event (079's statuses; the unique index is the backstop
    and a 23505 is reported as the same sentence);
  - link written before the email; a failed send is reported, not undone.
    If the link write fails after creating an invited account, that account is
    deleted again.
  - a sponsorship with no contact email takes the invited address.
- The invite/resend link lands on /auth/reset-password (heading "Create your
  password" when opened from an invite), which sets the password and opens
  /portal.
- /admin/sponsorships: a "Portal:" line on each row (Invite & link, or
  Linked ✓ with Resend and Unlink). /admin/applications drawer: the same, with
  **no Unlink** (an application's user_id is usually the applicant's own
  sign-up; the route refuses application unlinks).

## Not verified live

Nothing here was run against production: it creates auth users and sends
email. Suggested check (Ryan): add a sponsorship named `ZZ Invite Test`,
Invite & link an address you control, open the email, set a password, see it
in /portal; then Invite & link it again (expect the "in your portal" email);
then Unlink, and delete the test user and the ZZ row.

## Watch

- `applications.user_id` is `on delete cascade` to auth.users (001). Deleting
  an invited account that is linked to an application deletes the application
  (unless protected, 082). Unlink or relink first. Sponsorships block the
  delete instead (no ON DELETE action).
- The invite link is single-use and expires (Supabase setting). Resend from
  the same button; the email also points at "Forgot password".
