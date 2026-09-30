# Session 2026-09-30: local verify harness (branch chore/verify-local)

Why: verify_087 passed on a hand-written minimal PGlite schema and failed
live on `sponsorships.tier` (NOT NULL, no default), 2026-09-30.

## `npm run verify:local` (scripts/verify-local.mjs)
- It replays **every migration** in supabase/migrations into PGlite 0.5.8
  (Postgres 17 in WASM; devDependency, nothing to install), skipping 015 and
  047 as in migrations.md. Supabase's own pieces are stand-ins: auth.users /
  uid() / role() / jwt(), storage.buckets / objects / foldername(), the
  platform roles, and Supabase's default EXECUTE grants to anon and
  authenticated (the reason for the 073 grant audit).
- **Seed:** an admin; the RLS harness user, both created through auth.users
  so the real handle_new_user trigger runs; and a "Live Exhibitor" on booth 2
  of the active event (020 seeds the event and its 267 booths).
- **Modes:**
  - `npm run verify:local -- <verify.sql ...>` runs the files and prints
    their NOTICE lines;
  - `--audit` checks every INSERT in supabase/verify against the replayed
    catalog's NOT NULL-without-default columns, minus columns a BEFORE INSERT
    trigger assigns;
  - `--dump-schema <out>` writes a pg_dump of the replay (public schema,
    schema only, no owner) to diff against production.
- Exit codes: 0 pass, 1 verify or audit failure, 2 replay failure. The
  whole run takes about 1.6 s.

**Checks (2026-09-30):**
- verify_086 and verify_087 both PASS, every block.
- The pre-fix verify_087 (b745698) FAILS with the live error (`null value
  in column "tier"`).
- `--audit`: 102 fixture inserts, 0 missing.
- `--dump-schema`: 5,163 lines, 64 policies, 35 functions in public.

**CLAUDE.md:** the standing rules now require `verify:local` for the new or
changed verify, plus `--audit`, before delivery. The PR must say so.

## scripts/check-sql-fixtures.py is superseded (not removed here)
It would have caught `tier`. But on today's tree it reports 23 false
positives: applications.booth_size (021 dropped its NOT NULL) and
invoices.application_id, because it parses DDL text and misses
`drop not null`. The --audit mode reads the real replayed catalog instead
(0 false positives). docs/handoff/rules.md still lists the Python script.
**For the next docs PR:** point rules.md at `npm run verify:local --
--audit` and delete the Python script.

## Production schema dump (Ryan runs it; for the replay diff)
The command is in the header of scripts/verify-local.mjs.
- libpq's pg_dump (`brew install libpq`), against the Supabase session
  pooler (port 5432), with `--schema-only --no-owner --schema=public`.
- Output goes to `supabase/.schema-dumps/prod-public-YYYY-MM-DD.sql`
  (gitignored by this PR).
- The connection string never enters the repo or .env.local; pg_dump
  prompts for the password.
