#!/usr/bin/env node
/**
 * Run verify SQL against a local copy of the production schema, BEFORE
 * delivering it. Required by CLAUDE.md for every new or changed verify.
 *
 *   npm run verify:local -- supabase/verify/verify_087.sql [more.sql ...]
 *   npm run verify:local -- --audit                 # every verify's fixture INSERTs vs NOT NULL columns
 *   npm run verify:local -- --dump-schema out.sql   # schema-only dump of the replay, to diff against production
 *   npm run verify:local -- --before 089 pre.sql supabase/migrations/089_x.sql check.sql
 *                                                   # replay only migrations below 089, then run the files in
 *                                                   # order: test a data mapping against rows that predate it
 *
 * PRODUCTION SIDE of that diff (Ryan runs it; the connection string never
 * enters this repo or .env.local). Session pooler, port 5432, schema only,
 * same flags as --dump-schema; pg_dump prompts for the database password:
 *
 *   mkdir -p supabase/.schema-dumps
 *   /opt/homebrew/opt/libpq/bin/pg_dump \
 *     -h <session-pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
 *     --schema-only --no-owner --schema=public \
 *     -f supabase/.schema-dumps/prod-public-$(date +%F).sql
 *
 * supabase/.schema-dumps/ is gitignored.
 *
 * HOW THE SCHEMA IS BUILT: every file in supabase/migrations, in order, is
 * replayed into PGlite (Postgres compiled to WASM, in-process, nothing to
 * install). docs/handoff/migrations.md says the migration files match
 * production except SKIP below. Supabase's own schemas are stand-ins: auth
 * (users, uid(), role(), jwt()), storage (buckets, objects, foldername()), and
 * the platform roles. Only what the migrations reference is stubbed.
 *
 * WHY NOT A HAND-WRITTEN MINIMAL SCHEMA: verify_087's first live run failed
 * (2026-09-30) on sponsorships.tier, a NOT NULL column the minimal schema did
 * not have, after passing locally. The replay reproduces that failure.
 *
 * LIMITS - what this cannot tell you:
 *   - Anything not in a migration: objects created by hand in the dashboard
 *     (e.g. the site-assets bucket), or drift where production differs from
 *     the files. `--dump-schema` exists so a production schema-only dump can
 *     be diffed against the replay to find exactly that.
 *   - Real Supabase auth/storage behaviour. Storage is never written by a
 *     verify (rules.md); exercise uploads through the Storage API instead.
 *   - Concurrency. Row locks are asserted from function bodies, not raced.
 *
 * SEED (skip with --no-seed): an admin profile, the RLS harness user
 * (rls-harness@allamericantattooconvention.com, role exhibitor), both created
 * through auth.users so the real handle_new_user trigger makes the profiles,
 * and one approved "Live Exhibitor" on booth 2 of the active event, so the
 * verifies' "live event unchanged" checks compare something real. Migration
 * 020 already seeds the active 2027 event and its 267 booths.
 *
 * Exit codes: 0 every file passed; 1 a verify raised (or the audit found a
 * problem); 2 the replay itself failed.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase/migrations')
const VERIFY = join(ROOT, 'supabase/verify')

/** Never applied in production (migrations.md): 015 superseded by 079b, 047 HELD. */
const SKIP = new Set(['015', '047'])

const PRELUDE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;
create role authenticator nologin; create role supabase_admin nologin; create role dashboard_user nologin;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false,
  avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored, version text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create function storage.extension(name text) returns text language sql immutable as
  $$ select reverse(split_part(reverse(name), '.', 1)) $$;
grant usage on schema storage to anon, authenticated, service_role;

-- Supabase's default privileges: every new public function is executable by
-- anon and authenticated. The 073 grant audit exists because of this, so the
-- replay must reproduce it or grant checks pass here and fail live.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`

const SEED = `
insert into auth.users (email, raw_user_meta_data) values
  ('admin@example.com', '{"full_name":"Local Admin"}'),
  ('rls-harness@allamericantattooconvention.com', '{"full_name":"RLS Harness"}');
update public.profiles set role = 'admin' where email = 'admin@example.com';
update public.profiles set role = 'exhibitor' where email = 'rls-harness@allamericantattooconvention.com';
do $$
declare e uuid := (select id from public.events where is_active); a uuid;
begin
  if e is null then raise exception 'seed: no active event after the replay'; end if;
  insert into public.applications (event_id, exhibitor_type, business_name, contact_name, email, total_amount, status, vendor_single_qty, artist_count)
  values (e, 'vendor', 'Live Exhibitor', 'Live', 'live@example.com', 50000, 'approved', 1, 0) returning id into a;
  update public.booths set application_id = a, status = 'reserved' where event_id = e and booth_number = '2';
end $$;
`

function migrationFiles() {
  return readdirSync(MIGRATIONS).filter(f => /^\d{3}[a-z]?_.*\.sql$/.test(f)).sort()
}

export async function buildReplay({ seed = true, log = console.log, before = null } = {}) {
  const db = new PGlite()
  await db.exec(PRELUDE)
  let n = 0
  const skipped = []
  for (const f of migrationFiles()) {
    if (/^\d{3}_/.test(f) && SKIP.has(f.slice(0, 3))) { skipped.push(f); continue }
    if (before && f.slice(0, 3) >= before) continue
    try {
      await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
      n++
    } catch (e) {
      const err = new Error(`replay failed at ${f}: ${e.message}`)
      err.code = 'REPLAY'
      throw err
    }
  }
  log(`[verify-local] replayed ${n} migrations${before ? ` (below ${before})` : ''} (skipped: ${skipped.join(', ')})`)
  if (seed) {
    await db.exec(SEED)
    log('[verify-local] seeded: admin, RLS harness user, Live Exhibitor on booth 2')
  }
  return db
}

async function runFiles(db, files) {
  let failed = 0
  for (const f of files) {
    const notices = []
    try {
      await db.exec(readFileSync(f, 'utf8'), { onNotice: m => notices.push(m.message) })
      for (const m of notices) console.log(`  ${m}`)
      console.log(`[verify-local] PASS ${basename(f)}`)
    } catch (e) {
      for (const m of notices) console.log(`  ${m}`)
      console.log(`[verify-local] FAIL ${basename(f)}: ${e.message}`)
      failed++
    }
  }
  return failed
}

/**
 * Every INSERT in supabase/verify against the replayed catalog: columns that
 * are NOT NULL, have no default, are not generated, and are not assigned by a
 * BEFORE INSERT trigger on the same table (contest_votes.vote_date). Unlike
 * the removed scripts/check-sql-fixtures.py (2026-10-07) this reads the real schema, so a later
 * `drop not null` (applications.booth_size, 021) is not a false positive.
 */
async function audit(db) {
  const req = await db.query(`
    select c.table_name, c.column_name from information_schema.columns c
     where c.table_schema = 'public' and c.is_nullable = 'NO' and c.column_default is null
       and c.is_generated = 'NEVER' and c.identity_generation is null`)
  const trig = await db.query(`
    select t.event_object_table as table_name, p.prosrc
      from information_schema.triggers t
      join pg_trigger pt on pt.tgname = t.trigger_name and pt.tgrelid = (quote_ident(t.event_object_schema) || '.' || quote_ident(t.event_object_table))::regclass
      join pg_proc p on p.oid = pt.tgfoid
     where t.event_object_schema = 'public' and t.action_timing = 'BEFORE' and t.event_manipulation = 'INSERT'`)
  const filled = new Map()
  for (const r of trig.rows) {
    for (const m of r.prosrc.matchAll(/new\.([a-z_][a-z0-9_]*)\s*:=/gi)) {
      if (!filled.has(r.table_name)) filled.set(r.table_name, new Set())
      filled.get(r.table_name).add(m[1].toLowerCase())
    }
  }
  const required = new Map()
  for (const r of req.rows) {
    if (filled.get(r.table_name)?.has(r.column_name)) continue
    if (!required.has(r.table_name)) required.set(r.table_name, new Set())
    required.get(r.table_name).add(r.column_name)
  }
  let checked = 0, problems = 0
  for (const f of readdirSync(VERIFY).filter(x => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(VERIFY, f), 'utf8')
    for (const m of sql.matchAll(/insert\s+into\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const table = m[1].toLowerCase()
      if (!required.has(table)) continue
      checked++
      const cols = new Set(m[2].split(',').map(c => c.trim().toLowerCase()))
      const missing = [...required.get(table)].filter(c => !cols.has(c))
      if (missing.length) {
        const line = sql.slice(0, m.index).split('\n').length
        console.log(`  MISSING ${f}:${line}  ${table}  needs ${JSON.stringify(missing)}`)
        problems++
      }
    }
  }
  console.log(`[verify-local] audit: ${checked} fixture inserts checked, ${problems} missing a required column`)
  return problems
}

async function dumpSchema(db, out) {
  const { pgDump } = await import('@electric-sql/pglite-tools/pg_dump')
  // Same flags as the production command in the header, so the two files
  // differ only where the schemas do.
  const file = await pgDump({ pg: db, args: ['--schema-only', '--no-owner', '--schema=public'] })
  writeFileSync(out, await file.text())
  console.log(`[verify-local] replay schema dumped to ${out}`)
}

async function main() {
  const args = process.argv.slice(2)
  const seed = !args.includes('--no-seed')
  const doAudit = args.includes('--audit')
  const di = args.indexOf('--dump-schema')
  const dumpTo = di >= 0 ? args[di + 1] : null
  const bi = args.indexOf('--before')
  const before = bi >= 0 ? args[bi + 1] : null
  const files = args.filter((a, i) => !a.startsWith('--') && (di < 0 || i !== di + 1) && (bi < 0 || i !== bi + 1))
  if (!doAudit && !dumpTo && files.length === 0) {
    console.log('usage: npm run verify:local -- <verify.sql ...> | --audit | --dump-schema <out.sql>  [--no-seed]')
    process.exit(1)
  }
  let db
  try {
    db = await buildReplay({ seed: seed && !dumpTo, before })
  } catch (e) {
    console.log(`[verify-local] ${e.message}`)
    process.exit(2)
  }
  let bad = 0
  if (dumpTo) await dumpSchema(db, dumpTo)
  if (doAudit) bad += await audit(db)
  if (files.length) bad += await runFiles(db, files)
  process.exit(bad ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
