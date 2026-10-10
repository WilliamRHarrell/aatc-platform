# AATC Platform

The All American Tattoo Convention site: public event pages, artist/vendor/sponsor
applications and payments (Stripe), the exhibitor portal, and the admin console.
Next.js App Router on Vercel, Supabase (Postgres, RLS, Storage, Auth), Resend
for email.

## Start here

Read the **START HERE** block in [docs/HANDOFF.md](docs/HANDOFF.md) before
doing anything: open PRs, what is applied in production, what is queued. The
rest lives in [docs/handoff/](docs/handoff/):

- `rules.md` - the full rules index; this file is only the short list.
- `migrations.md` - the one home for whether a migration or seed is applied.
- `open-items.md` - open items and deferred work.
- `sessions/` - one file per dated session.

**Handoff notes:** a branch adds its own `docs/handoff/sessions/YYYY-MM-DD-<topic>.md`
and edits no other handoff file. START HERE and `migrations.md` change only
after something is merged or applied, on their own docs PR.

## Standing rules

- **Claude works in its own git worktree, `../aatc-platform-claude`**, never
  in `aatc-platform/` (Ryan's checkout): no branch switches, commits or
  builds there. Commit and push work in progress before leaving a branch.
  Setup if missing: `git worktree add --detach ../aatc-platform-claude
  origin/develop`, then in it `npm ci` (a symlinked node_modules breaks
  Turbopack) and `ln -s ../aatc-platform/.env.local .env.local`.
- **Report before building.** Summarize what you will change and wait for a go.
- **No stacked PRs.** Base every PR on `develop`. If it needs another open PR's
  code, wait for that merge.
- **`develop` is production.** Merging to develop deploys the live site.
- **Migrations are delivered, not applied.** Write the migration and its
  `supabase/verify/verify_NNN.sql`; Ryan runs the SQL. Never edit a migration
  someone may be partway through applying; add a new one.
- **Run every new or changed verify locally before delivering it:**
  `npm run verify:local -- supabase/verify/verify_NNN.sql` (the schema is
  replayed from every migration, so real NOT NULLs, checks and triggers
  apply) and `npm run verify:local -- --audit`. Both must pass, and the PR
  says so. Never hand-write a minimal test schema (verify_087 passed on one
  and failed live on sponsorships.tier).
- **When telling Ryan to run SQL, always say copy it from the Raw file on
  develop** (Code → file → Raw), never from a PR's changes view.
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
