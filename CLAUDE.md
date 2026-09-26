# AATC Platform

The All American Tattoo Convention site: public event pages, artist/vendor/sponsor
applications and payments (Stripe), the exhibitor portal, and the admin console.
Next.js App Router on Vercel, Supabase (Postgres, RLS, Storage, Auth), Resend
for email.

## Start here

Read the **START HERE** block at the top of [docs/HANDOFF.md](docs/HANDOFF.md)
before doing anything. It holds current state: open PRs, which migrations are
applied in production, and what is queued. Section 6 of that file indexes the
full rules; this file is only the short list.

## Standing rules

- **Report before building.** Summarize what you will change and wait for a go.
- **No stacked PRs.** Base every PR on `develop`. If it needs another open PR's
  code, wait for that merge.
- **`develop` is production.** Merging to develop deploys the live site.
- **Migrations are delivered, not applied.** Write the migration and its
  `supabase/verify/verify_NNN.sql`; Ryan runs the SQL. Never edit a migration
  someone may be partway through applying; add a new one.
- **Never write storage tables from a verify.** Assert storage policies from
  `pg_policies`; exercise uploads through the Storage API
  (`scripts/verify-graphics-owner.mjs` pattern).
- **Enumerate existing policies before changing them.** Read `pg_policies` for
  the table first; permissive policies OR together and baselines often carry an
  owner path.
- **Don't invent content.** No placeholder people, brands, figures, times or
  assets. Leave it empty and say what is missing.
- **One home per fact.** A time, price, room, count or name is stated in one
  place and read from there.
- **Contact address comes from `CONTACT_EMAIL`** (`src/lib/event-config.ts`),
  never a literal.

## Layout

- App source: `src/app/` (App Router). Shared code in `src/lib/`.
- Migrations: `supabase/migrations/`; verify blocks in `supabase/verify/`;
  seeds and teardowns in `supabase/seeds/`.
- Plans: `docs/superpowers/plans/`. Launch list: `docs/CUTOVER.md`.
- `npm run build` runs prebuild guards (event dates, no date literals, no em
  dashes in `src/`); `npm test` runs vitest.
