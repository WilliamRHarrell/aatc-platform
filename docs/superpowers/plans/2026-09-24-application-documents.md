# Application Documents (private bucket, admin viewer, veteran verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can open every uploaded application document (vendor ID, per-artist IDs, veteran proof) from the application drawer through five-minute signed URLs minted server-side after a role check, mark the veteran document verified, and edit the veteran upload wording without a code change; the bucket's policies match "private, own-folder insert, admin-only read".

**Architecture:** Migration 071 rewrites the `application-docs` storage policies and adds `veteran_doc_verified_at` / `veteran_doc_verified_by` to `applications` (verified = `verified_at is not null`, one home), extends the 043 clamp so owners cannot self-verify, and un-verifies whenever `veteran_id_url` changes. One server route (`POST /api/admin/application-docs`) resolves document paths from the application row (never from the request), lists storage metadata and mints 300 s signed URLs; a shared client hook feeds both the drawer and the booth detail page so signing has one home. The apply pages become thin server wrappers reading a new `applyForms` registry entry and rendering the existing client forms.

**Tech Stack:** Next.js 16 App Router, Supabase RLS + Storage, vitest (`npm test`, node env, `src/**/*.test.ts`), guardedWrite on admin writes.

**Spec:** Ryan's task message of 2026-09-24 ("Admin: view application documents", items 1-6) plus the decisions D1-D4 accepted in chat: D1 only `role = 'admin'` reads ID documents; D2 label stays "Veteran ID / proof of service", help text is Ryan's string; D3 the booth detail page uses the same route; D4 "own read" is dropped.

## Global Constraints

- Source lives in `src/app/` (and `src/lib`, `src/content`, `src/components`); no em/en dashes in `src/` (prebuild guard).
- `develop` is production; work on `feat/application-documents`; open a PR into develop.
- Don't invent content. The only new copy is Ryan's help string and UI labels for controls.
- Migration **071** and `verify_071.sql` are delivered, never applied. Ryan runs the SQL.
- Existing policies are enumerated in the migration header before any change.
- One home per fact: verification is the two columns; signing is the one route; the veteran wording is the registry entry.
- `guardedWrite()` on every admin write from the browser.
- `CONTACT_EMAIL` for any contact address (none is added here).
- `src/types/database.ts` is hand-maintained; add the two columns there.
- Never render a signed URL server-side; never a permanent public URL.

## Review Focus

1. **A legacy row whose `id_url` is a full public URL** (`.../application-docs/<path>` from the first months). `normalizeDocPath` strips to the object path; test in Task 1.
2. **A non-admin with a valid session calls the route.** 403, nothing signed. The route checks `profile.role === 'admin'` before touching the row. Manual curl in Task 5 with no cookie (401) is the positive control that the check runs.
3. **An applicant replaces the veteran document after it was verified.** The clamp function clears both verification columns for every writer, including admins. verify_071 block D.
4. **An applicant tries to write verification columns through the owner UPDATE policy.** Clamped back to OLD. verify_071 block D (owner simulation via `set local role authenticated` + JWT claim).
5. **A vendor application (artists null).** Its ID document renders. Task 1 test for `listDocRefs` with a vendor row; Task 6 wires the component.

---

## Decisions recorded (Ryan can overturn any)

- **D5. Where verification lives.** Two columns on `applications`, not a side table: `veteran_doc_verified_at timestamptz`, `veteran_doc_verified_by uuid references profiles(id) on delete set null`. "Verified" means `verified_at is not null`; no boolean twin.
- **D6. Reset-on-change is inside the clamp function**, after the owner clamp, so trigger ordering cannot let an owner's document swap survive with the old verification (a separate BEFORE trigger firing before the clamp would restore OLD over the reset).
- **D7. Metadata source.** File name, mime type, size and upload date come from `storage.objects` via `storage.from().list(folder, { search: fileName })`, not from parsing the timestamp in the file name.
- **D8. Thumbnails** use the same 300 s signed URL as View; they are requested when the section mounts and again on each View click. A PDF gets an icon, not a thumbnail.
- **D9. `PAGE_ROUTE` becomes `Record<string, string | string[]>`** with `routesFor(pageKey)`; the editor purges every route. The revalidate allow-list moves to `src/lib/revalidate-paths.ts` so a test can assert every registry route is purgeable.
- **D10. Orphan cleanup script** is delivered at `scripts/cleanup-application-docs-orphans.mjs`, dry-run by default, deletes only with `--delete`, only files with no referencing application row and older than 7 days, prints every path it would delete or deleted. Not run by the implementer.

---

### Task 1: Pure helpers for application documents

**Files:**
- Create: `src/lib/application-docs.ts`
- Test: `src/lib/application-docs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SIGNED_URL_TTL_SECONDS = 300
  export const DOCS_BUCKET = 'application-docs'
  export type DocKey = 'id' | 'veteran' | `artist-${number}`
  export interface DocRef { key: DocKey; label: string; path: string }
  export type DocKind = 'image' | 'pdf' | 'other'
  export function normalizeDocPath(raw: string): string
  export function listDocRefs(app: { id_doc_url: string | null; veteran_id_url: string | null; artists: unknown }): DocRef[]
  export function docKind(mimeOrPath: string | null | undefined): DocKind
  export function veteranNeedsVerification(app: { is_veteran: boolean; veteran_doc_verified_at: string | null }): boolean
  export function splitPath(path: string): { folder: string; fileName: string }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeDocPath, listDocRefs, docKind, veteranNeedsVerification, splitPath, SIGNED_URL_TTL_SECONDS } from '@/lib/application-docs'

describe('normalizeDocPath', () => {
  it('returns an object path unchanged', () => {
    expect(normalizeDocPath('u1/123-id.jpg')).toBe('u1/123-id.jpg')
  })
  it('strips a legacy full URL down to the object path', () => {
    expect(normalizeDocPath('https://x.supabase.co/storage/v1/object/public/application-docs/u1/123-id.jpg')).toBe('u1/123-id.jpg')
  })
})

describe('listDocRefs', () => {
  it('lists the vendor ID when artists is null', () => {
    expect(listDocRefs({ id_doc_url: 'u1/1-id.jpg', veteran_id_url: null, artists: null }))
      .toEqual([{ key: 'id', label: 'Government ID', path: 'u1/1-id.jpg' }])
  })
  it('lists per-artist IDs in order and skips artists without one', () => {
    const refs = listDocRefs({ id_doc_url: null, veteran_id_url: null, artists: [{ name: 'A', id_url: 'u1/1-artist-1-id.png' }, { name: 'B', id_url: null }, { name: 'C', id_url: 'u1/1-artist-3-id.png' }] })
    expect(refs.map(r => r.key)).toEqual(['artist-1', 'artist-3'])
    expect(refs[0].label).toBe('Artist 1 - A')
  })
  it('lists the veteran document last', () => {
    const refs = listDocRefs({ id_doc_url: 'u1/1-id.jpg', veteran_id_url: 'u1/1-veteran-id.pdf', artists: null })
    expect(refs.at(-1)).toEqual({ key: 'veteran', label: 'Veteran proof of service', path: 'u1/1-veteran-id.pdf' })
  })
  it('never returns an empty path', () => {
    expect(listDocRefs({ id_doc_url: '', veteran_id_url: null, artists: [{ id_url: '' }] })).toEqual([])
  })
})

describe('docKind', () => {
  it('image mime types are images', () => { expect(docKind('image/jpeg')).toBe('image') })
  it('pdf is pdf', () => { expect(docKind('application/pdf')).toBe('pdf') })
  it('falls back to the extension', () => { expect(docKind('u1/1-id.PNG')).toBe('image'); expect(docKind('u1/1-id.pdf')).toBe('pdf') })
  it('unknown is other', () => { expect(docKind(null)).toBe('other') })
})

describe('veteranNeedsVerification', () => {
  it('true when the discount is claimed and nothing is verified', () => {
    expect(veteranNeedsVerification({ is_veteran: true, veteran_doc_verified_at: null })).toBe(true)
  })
  it('false when verified', () => {
    expect(veteranNeedsVerification({ is_veteran: true, veteran_doc_verified_at: '2026-09-24T00:00:00Z' })).toBe(false)
  })
  it('false when the discount is not claimed', () => {
    expect(veteranNeedsVerification({ is_veteran: false, veteran_doc_verified_at: null })).toBe(false)
  })
})

describe('splitPath', () => {
  it('splits folder and file name', () => {
    expect(splitPath('admin/app1/artist-2-id-1.jpg')).toEqual({ folder: 'admin/app1', fileName: 'artist-2-id-1.jpg' })
  })
})

describe('signed url ttl', () => {
  it('is five minutes', () => { expect(SIGNED_URL_TTL_SECONDS).toBe(300) })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/application-docs.test.ts`
Expected: FAIL, cannot resolve `@/lib/application-docs`.

- [ ] **Step 3: Implement**

```ts
/** Application document helpers - the ONE home for how a row's uploads are enumerated. */
export const SIGNED_URL_TTL_SECONDS = 300
export const DOCS_BUCKET = 'application-docs'
export type DocKey = 'id' | 'veteran' | `artist-${number}`
export interface DocRef { key: DocKey; label: string; path: string }
export type DocKind = 'image' | 'pdf' | 'other'

const BUCKET_MARKER = `/${DOCS_BUCKET}/`

export function normalizeDocPath(raw: string): string {
  const i = raw.indexOf(BUCKET_MARKER)
  return i >= 0 ? raw.slice(i + BUCKET_MARKER.length) : raw
}

type ArtistLike = { name?: string | null; id_url?: string | null }

export function listDocRefs(app: { id_doc_url: string | null; veteran_id_url: string | null; artists: unknown }): DocRef[] {
  const refs: DocRef[] = []
  if (app.id_doc_url) refs.push({ key: 'id', label: 'Government ID', path: normalizeDocPath(app.id_doc_url) })
  const artists = Array.isArray(app.artists) ? (app.artists as ArtistLike[]) : []
  artists.forEach((a, i) => {
    if (!a?.id_url) return
    refs.push({ key: `artist-${i + 1}`, label: `Artist ${i + 1}${a.name ? ` - ${a.name}` : ''}`, path: normalizeDocPath(a.id_url) })
  })
  if (app.veteran_id_url) refs.push({ key: 'veteran', label: 'Veteran proof of service', path: normalizeDocPath(app.veteran_id_url) })
  return refs
}

export function docKind(mimeOrPath: string | null | undefined): DocKind {
  if (!mimeOrPath) return 'other'
  const s = mimeOrPath.toLowerCase()
  if (s.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/.test(s)) return 'image'
  if (s === 'application/pdf' || s.endsWith('.pdf')) return 'pdf'
  return 'other'
}

export function veteranNeedsVerification(app: { is_veteran: boolean; veteran_doc_verified_at: string | null }): boolean {
  return app.is_veteran && !app.veteran_doc_verified_at
}

export function splitPath(path: string): { folder: string; fileName: string } {
  const i = path.lastIndexOf('/')
  return i < 0 ? { folder: '', fileName: path } : { folder: path.slice(0, i), fileName: path.slice(i + 1) }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/application-docs.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application-docs.ts src/lib/application-docs.test.ts
git commit -m "feat(docs): pure helpers - document refs from a row, legacy URL normalisation, kind, verification predicate"
```

### Task 2: Migration 071 + verify_071 (delivered, not applied)

**Files:**
- Create: `supabase/migrations/071_application_docs_private_and_verification.sql`
- Create: `supabase/verify/verify_071.sql`
- Modify: `src/types/database.ts` (applications Row/Insert/Update: add `veteran_doc_verified_at: string | null`, `veteran_doc_verified_by: string | null`)

**Interfaces:**
- Produces: columns `applications.veteran_doc_verified_at`, `applications.veteran_doc_verified_by`; storage policies `application-docs: own folder insert`, `application-docs: admin insert`, `application-docs: admin read`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 071: application-docs is PRIVATE and admin-only; veteran document
-- verification.
--
-- POLICIES ENUMERATED BEFORE WRITING (storage.objects, bucket application-docs,
-- all from 004; nothing later touched this bucket):
--   "application-docs: authenticated upload"  INSERT to authenticated
--       with check (bucket_id = 'application-docs')          <- UNSCOPED: any
--       signed-in user could write into any folder, including another user's
--       and admin/. DROPPED, replaced by the two scoped inserts below.
--   "application-docs: own read"  SELECT to authenticated, folder[1] = uid
--       DROPPED (Ryan, D4 2026-09-24). No applicant-facing code reads a file
--       back: /portal shows presence only; the drawer and booth page are admin.
--   "application-docs: admin read"  SELECT to authenticated using is_admin()
--       KEPT and re-created verbatim so this file pins its body.
-- No anon policy exists and buckets.public = false (verified live 2026-09-24
-- via the Storage API), so public read was already impossible.
-- Nobody holds UPDATE or DELETE. Retention deletes will use the service role.
--
-- Roles: only role = 'admin' reads ID documents (src/lib/roles.ts, D1).
-- content_editor and sponsorship_manager are excluded on purpose.
--
-- Verification is TWO COLUMNS on applications, one fact: verified means
-- veteran_doc_verified_at is not null. Both are clamped for owners (041/043
-- shape, service role exempt), and BOTH are cleared for EVERY writer when
-- veteran_id_url changes - replacing the document always un-verifies it. The
-- reset lives inside the clamp function AFTER the owner clamp; a separate
-- trigger could fire first and have the clamp restore OLD over the reset.
-- ============================================================
begin;

-- ── 1. Storage policies ──────────────────────────────────────
drop policy if exists "application-docs: authenticated upload" on storage.objects;
drop policy if exists "application-docs: own read" on storage.objects;
drop policy if exists "application-docs: admin read" on storage.objects;

create policy "application-docs: own folder insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'application-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The booth detail admin page uploads replacement artist IDs under admin/<application id>/.
create policy "application-docs: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'application-docs' and public.is_admin());

create policy "application-docs: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'application-docs' and public.is_admin());

-- ── 2. Verification columns ──────────────────────────────────
alter table public.applications
  add column if not exists veteran_doc_verified_at timestamptz,
  add column if not exists veteran_doc_verified_by uuid references public.profiles(id) on delete set null;

comment on column public.applications.veteran_doc_verified_at is
  'Set by an admin in /admin/applications after viewing the veteran document. NULL = not verified. Cleared automatically whenever veteran_id_url changes.';
comment on column public.applications.veteran_doc_verified_by is
  'profiles.id of the admin who verified. NULL whenever veteran_doc_verified_at is NULL.';

-- ── 3. Clamp (043 body) + verification clamp + reset-on-change ──
create or replace function public.applications_protect_staff_columns()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare roster_ok boolean;
begin
  if not (public.is_admin() or auth.uid() is null) then
    new.status := old.status;  new.approved_at := old.approved_at;
    new.deposit_due_at := old.deposit_due_at;  new.final_due_at := old.final_due_at;
    new.total_amount := old.total_amount;  new.directory_override := old.directory_override;
    new.is_veteran := old.is_veteran;  new.corner_count := old.corner_count;
    new.artist_single_qty := old.artist_single_qty;  new.artist_double_qty := old.artist_double_qty;
    new.vendor_single_qty := old.vendor_single_qty;  new.vendor_double_qty := old.vendor_double_qty;
    new.user_id := old.user_id;  new.event_id := old.event_id;
    new.exhibitor_type := old.exhibitor_type;
    -- 071: owners cannot verify their own document.
    new.veteran_doc_verified_at := old.veteran_doc_verified_at;
    new.veteran_doc_verified_by := old.veteran_doc_verified_by;
    if old.needs_roster and not new.needs_roster then
      if old.exhibitor_type = 'artist' then
        roster_ok := new.artists is not null
          and jsonb_typeof(new.artists) = 'array'
          and jsonb_array_length(new.artists) > 0
          and not exists (select 1 from jsonb_array_elements(new.artists) e
                           where coalesce(e->>'id_url', '') = '');
      else
        roster_ok := coalesce(new.id_doc_url, '') <> '';
      end if;
      if not roster_ok then new.needs_roster := old.needs_roster; end if;
    elsif not old.needs_roster and new.needs_roster then
      new.needs_roster := old.needs_roster;
    end if;
  end if;

  -- 071: EVERY writer. A replaced document is an unverified document.
  if new.veteran_id_url is distinct from old.veteran_id_url then
    new.veteran_doc_verified_at := null;
    new.veteran_doc_verified_by := null;
  end if;

  return new;
end $$;

-- Trigger already exists from 041 (applications_protect_staff_columns_trg); the
-- function body is replaced in place.

commit;
```

- [ ] **Step 2: Write verify_071**

Blocks: A policies grid (`pg_policies` where `schemaname='storage' and policyname like 'application-docs:%'`, expect exactly the three names, raise on `authenticated upload` or `own read` present); B columns and FK exist; C `pg_get_functiondef('public.applications_protect_staff_columns'::regproc)` contains `veteran_doc_verified_at`; D fixtures: insert a ZZ application for the RLS harness user (`rls-harness@allamericantattooconvention.com`, from `auth.users`), set verified as postgres, then `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <harness uid>, 'role', 'authenticated')::text, true);` update `veteran_doc_verified_at := now()` as the owner and assert it stayed NULL... (positive control: the same owner update changes `notes`, assert it landed); reset role; as postgres set verified, then update `veteran_id_url` and assert both verification columns are NULL; delete the fixture in the last block that needs it. E `buckets.public = false` for application-docs, raise otherwise.

- [ ] **Step 3: Add the two columns to `src/types/database.ts`** (Row, Insert optional, Update optional) beside `veteran_id_url`.

- [ ] **Step 4: `npx tsc --noEmit`** Expected: clean (columns only add optional fields).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/071_application_docs_private_and_verification.sql supabase/verify/verify_071.sql src/types/database.ts
git commit -m "feat(docs): migration 071 - scoped inserts, admin-only read, veteran verification columns, clamp + reset on document change; verify_071"
```

### Task 3: Server route that lists documents and mints 300 s signed URLs

**Files:**
- Create: `src/app/api/admin/application-docs/route.ts`
- Test: `src/lib/application-docs.test.ts` (add one source-reading test: `createSignedUrl(` appears in exactly one file under `src/`, this route)

**Interfaces:**
- Consumes: `listDocRefs`, `splitPath`, `docKind`, `SIGNED_URL_TTL_SECONDS`, `DOCS_BUCKET` from Task 1.
- Produces: `POST /api/admin/application-docs` body `{ applicationId: string }` → `200 { documents: SignedDoc[] }` where
  ```ts
  export interface SignedDoc { key: DocKey; label: string; fileName: string; mimeType: string | null; size: number | null; uploadedAt: string | null; kind: DocKind; url: string; expiresAt: string }
  ```
  (type exported from `src/lib/application-docs.ts`). 401 no session, 403 role not admin, 400 bad body, 404 row not visible.

- [ ] **Step 1: Write the failing source-reading test** (append to `application-docs.test.ts`)

```ts
describe('signing has one home', () => {
  it('createSignedUrl is called from the admin application-docs route only', () => {
    const offenders = walk(SRC).filter(f => readFileSync(f, 'utf8').includes('createSignedUrl(')).map(f => f.replace(SRC, 'src'))
    expect(offenders).toEqual(['src/app/api/admin/application-docs/route.ts'])
  })
})
```
(with the same `walk`/`SRC` helpers as `contact-email.test.ts`). Run: FAILS listing the drawer and booth page (and the route once it exists).

- [ ] **Step 2: Implement the route**

```ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { DOCS_BUCKET, SIGNED_URL_TTL_SECONDS, docKind, listDocRefs, splitPath, type SignedDoc } from '@/lib/application-docs'

/**
 * Admin-only. Resolves document paths from the APPLICATION ROW, never from the
 * request, so a caller cannot sign an arbitrary object. The Supabase calls run
 * as the signed-in admin, so the "application-docs: admin read" policy is the
 * authority and this role check is defence in depth.
 */
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { applicationId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { data: app } = await supabase.from('applications')
    .select('id, id_doc_url, veteran_id_url, artists').eq('id', applicationId).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
  const documents: SignedDoc[] = []
  for (const ref of listDocRefs(app)) {
    const { folder, fileName } = splitPath(ref.path)
    const [{ data: listed }, { data: signed }] = await Promise.all([
      supabase.storage.from(DOCS_BUCKET).list(folder, { search: fileName, limit: 1 }),
      supabase.storage.from(DOCS_BUCKET).createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS),
    ])
    if (!signed?.signedUrl) continue // the row references a file that is not there; the UI says so by omission + count
    const meta = listed?.find(o => o.name === fileName)
    const mimeType = (meta?.metadata as { mimetype?: string } | undefined)?.mimetype ?? null
    documents.push({
      key: ref.key, label: ref.label, fileName,
      mimeType, size: (meta?.metadata as { size?: number } | undefined)?.size ?? null,
      uploadedAt: meta?.created_at ?? null, kind: docKind(mimeType ?? fileName),
      url: signed.signedUrl, expiresAt,
    })
  }
  return NextResponse.json({ documents, missing: listDocRefs(app).length - documents.length })
}
```

- [ ] **Step 3: `npx tsc --noEmit`** clean. The source-reading test still fails until Tasks 6 and 7 remove the two client-side callers; that is expected and is the reason the test exists.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/application-docs/route.ts src/lib/application-docs.ts src/lib/application-docs.test.ts
git commit -m "feat(docs): admin-only route lists a row's documents with storage metadata and 300 s signed URLs"
```

### Task 4: Client hook and Documents component

**Files:**
- Create: `src/lib/use-application-docs.ts` (client hook)
- Create: `src/components/admin/ApplicationDocuments.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function useApplicationDocs(applicationId: string | null): { docs: SignedDoc[]; missing: number; loading: boolean; error: string | null; refresh: () => Promise<SignedDoc[]>; open: (key: DocKey) => Promise<void> }
  ```
  `open` re-fetches (fresh 300 s URL), then `window.open(url, '_blank', 'noopener')`. On 403 sets `error` to "Only full admins can view ID documents."
  ```tsx
  export default function ApplicationDocuments({ applicationId, filter }: { applicationId: string; filter?: (d: SignedDoc) => boolean })
  ```
  Renders each doc: 64 px thumbnail (`<img>` for kind image; file icon for pdf/other), label, file name, type, size, "Uploaded {date}", and a "View" button calling `open(key)`. Shows `missing` as "N referenced file(s) not found in storage" in `#f87171` when > 0. Empty state "No documents uploaded" in `#555`.

- [ ] **Step 1: Implement hook** (fetch POST, JSON, state; `useEffect` on `applicationId`).
- [ ] **Step 2: Implement component** in the drawer's visual language (`#0a0a0a` cards, `#2a2a2a` borders, gold `#C4A882` links, small text `#999`).
- [ ] **Step 3: `npx tsc --noEmit` && npm run lint -- src/components/admin src/lib/use-application-docs.ts`** clean.
- [ ] **Step 4: Commit** `feat(docs): useApplicationDocs hook and ApplicationDocuments component (thumbnails via signed URL, View re-signs)`.

### Task 5: Drawer - documents section, verified checkbox, approve/comp warning

**Files:**
- Modify: `src/app/admin/applications/page.tsx` (drawer: lines 105-149 signed-URL effect; 318-325 Veteran field; 359-413 Documents; 170-205 approve; 457-476 comp row; 504-512 approve button; parent 588-595 handler)
- Create: `src/components/admin/VeteranVerification.tsx`

**Interfaces:**
- Consumes: `ApplicationDocuments`, `veteranNeedsVerification`, `guardedWrite`.
- Produces: `VeteranVerification({ applicationId, verifiedAt, verifiedBy, onChange })` renders "Document verified" checkbox with "Verified by {full_name or email} on {date}" (profile fetched by id) and writes via `guardedWrite(supabase.from('applications').update({ veteran_doc_verified_at, veteran_doc_verified_by }).eq('id', id).select('id'))`. Parent gains `onPatch(id, patch: Partial<Application>)` beside `onStatusChange`.

- [ ] **Step 1: Delete the client-side signing effect** and the `artistSignedUrls` / `veteranIdUrl` state; replace the Documents section body with `<ApplicationDocuments applicationId={app.id} />`, keeping the `artists_ids_later` note above it. Section renders whenever the row has any document or the note.
- [ ] **Step 2: Veteran line.** Replace `<Field label="Veteran" value={app.is_veteran} />` with a block: "Veteran discount claimed" (yes/no) and, when claimed, `<VeteranVerification … />`.
- [ ] **Step 3: Warning gate.** Add `const unverified = veteranNeedsVerification(app)` and state `ackUnverified`. In `updateStatus('approved')` and when `compEnabled` is toggled on: if `unverified && !ackUnverified`, render an inline warning card (`#eab308` border): "This application claims the veteran discount and its document is not marked verified. Verify it above, or continue anyway." with the approve button relabelled "Approve without verified document" and the comp row showing the same sentence; the second click proceeds. Never a `window.confirm`.
- [ ] **Step 4: `npx tsc --noEmit` && `npm run lint -- src/app/admin/applications`** clean; `npx vitest run` - the one-home test now lists only the booth page.
- [ ] **Step 5: Commit** `feat(admin): application drawer lists every document via the signed route (vendor ID was fetched and never rendered), veteran document verification, approve/comp warning`.

### Task 6: Booth detail page uses the same route (D3)

**Files:**
- Modify: `src/app/admin/booths/[id]/page.tsx` (124-125 state; 173-196 signing; 876 + 903-908 artist link; 1089-1096 veteran link)

- [ ] **Step 1:** Replace the two `createSignedUrl` blocks and the two state hooks with `const docs = useApplicationDocs(app?.id ?? null)`; artist header button `onClick={() => docs.open(\`artist-${i + 1}\`)}` shown when `docs.docs.some(d => d.key === …)`; veteran button `docs.open('veteran')`. After an artist ID upload (line ~491) call `docs.refresh()`.
- [ ] **Step 2:** `npx vitest run` - one-home test PASSES (only the route calls `createSignedUrl`). `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** `refactor(admin): booth detail signs ID documents through the admin route - signing has one home`.

### Task 7: Registry entry + apply page wrappers + purge routes

**Files:**
- Modify: `src/content/registry.ts` (add `applyForms` def; `PAGE_ROUTE` type + `routesFor`)
- Create: `src/lib/revalidate-paths.ts` (move `ALLOWED_PATHS`, `ALLOWED_PATH_PATTERNS`, `ALLOWED_TAGS` from the route; add `/apply/artist`, `/apply/vendor`)
- Modify: `src/app/api/revalidate/route.ts` (import them)
- Modify: `src/app/admin/content/page.tsx:80-83` (`paths: routesFor(pageKey)`)
- Rename: `src/app/apply/artist/page.tsx` → `src/app/apply/artist/ArtistApplyForm.tsx`; new `page.tsx` server wrapper. Same for vendor (`VendorApplyForm.tsx`).
- Test: `src/content/registry.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe('booth application forms registry', () => {
  it('keeps the current label and carries the veteran proof help text', () => {
    const c = defaultsFor('applyForms')
    expect(c.veteran_doc_label).toBe('Veteran ID / proof of service')
    expect(c.veteran_doc_help).toBe('Veteran discount: upload a DD-214, VA ID card, or driver\'s license with veteran designation. Do not upload a military ID (CAC).')
  })
  it('purges both apply routes', () => {
    expect(routesFor('applyForms')).toEqual(['/apply/artist', '/apply/vendor'])
  })
})
describe('every registry route is purgeable', () => {
  it('is in the revalidate allow-list', () => {
    for (const page of REGISTRY) for (const r of routesFor(page.key)) expect(ALLOWED_PATHS.has(r), r).toBe(true)
  })
})
```
Update the existing PAGE_ROUTE test to use `routesFor`.

- [ ] **Step 2: Implement registry + allow-list + editor purge.** `export const PAGE_ROUTE: Record<string, string | string[]>`; `export function routesFor(pageKey: string): string[] { const r = PAGE_ROUTE[pageKey]; return r === undefined ? [] : Array.isArray(r) ? r : [r] }`.
- [ ] **Step 3: Server wrappers.** `git mv src/app/apply/artist/page.tsx src/app/apply/artist/ArtistApplyForm.tsx`; in the moved file rename the default export to `ArtistApplyForm` taking `{ content }: { content: { veteranDocLabel: string; veteranDocHelp: string } }` and use them at the `FileUploadField` (label/hint). New `page.tsx`:
  ```tsx
  import { getContent } from '@/content/getContent'
  import ArtistApplyForm from './ArtistApplyForm'
  export default async function ArtistApplyPage() {
    const c = await getContent('applyForms')
    return <ArtistApplyForm content={{ veteranDocLabel: c.veteran_doc_label, veteranDocHelp: c.veteran_doc_help }} />
  }
  ```
  Same for vendor. Keep any `export const metadata` that the client file had (client files cannot export metadata; check and move to the wrapper if present).
- [ ] **Step 4:** `npx vitest run` PASS; `npx tsc --noEmit`; `npm run build` and `curl -s localhost:3000/apply/vendor | grep -c 'DD-214'` after `npm start` = 1 (the help text renders server-side).
- [ ] **Step 5: Commit** `feat(content): veteran upload label and help text editable at /admin/content (applyForms); apply pages read the registry through server wrappers`.

### Task 8: Orphan cleanup script (delivered, not run)

**Files:**
- Create: `scripts/cleanup-application-docs-orphans.mjs`

- [ ] **Step 1:** Node script (loads `.env.local` like `scripts/verify-tattoo-battle-anon.mjs` does, service role). Walks the bucket recursively, loads every `applications` row's `id_doc_url`, `veteran_id_url`, `artists[].id_url` (normalised), builds the referenced set. Candidates = unreferenced AND `created_at` older than `--days` (default 7). Prints a table `path | size | created | reason`. Without `--delete` it ends with `DRY RUN - nothing deleted; re-run with --delete`. With `--delete` it removes candidates in batches of 50 via `storage.from(bucket).remove(paths)` and prints each deleted path plus counts; refuses to run when `applications` returns an error or zero rows unless `--allow-empty-applications` is passed (positive control: a broken read must not look like "nothing is referenced").
- [ ] **Step 2:** `node scripts/cleanup-application-docs-orphans.mjs` (dry run only) - output matches the 51-orphan listing from 2026-09-24. Do NOT pass `--delete`.
- [ ] **Step 3: Commit** `chore(docs): guarded orphan cleanup script for application-docs (dry-run default, 7-day guard)`.

### Task 9: HANDOFF

**Files:**
- Modify: `docs/HANDOFF.md` (§2 START HERE, migration table, OPEN ITEMS)

- [ ] **Step 1:** START HERE: PR #3 MERGED 2026-09-24 16:10 UTC; branches deleted; this branch/PR. New section "2026-09-24 Application documents" with: bucket findings, the vendor-render defect, policies before/after, verification columns, the route, the registry entry, verify_071 to run, and **the retention plan**: after `events.end_date + 30 days`, delete every `application-docs` object referenced by that event's applications and null the referencing columns (`id_doc_url`, `veteran_id_url`, `artists[].id_url`) in the same pass; rejected/expired/canceled applications 30 days after that status change; unreferenced files 7 days after upload (the cleanup script); implementation as a branch of the lifecycle sweep behind its own flag; log counts per run; **not built**. Orphan listing: 51 unreferenced files (26 in two applicant folders, 25 in four `admin/` folders), all from test applications torn down March-June 2026; 1 referenced file.
- [ ] **Step 2:** Migration table row: `071 | NOT APPLIED | …`. Note that verify_071 block D uses the RLS harness user and aborts if it is absent.
- [ ] **Step 3: Commit** `docs(handoff): application documents - 071 not applied, retention plan, orphan inventory, PR #3 merged and branches deleted`.

### Task 10: Whole-branch verification and PR

- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` (compare error count to develop's 22 pre-existing; no new ones), `npm run build`.
- [ ] Run `/security-review` on the branch; fold findings.
- [ ] Push, open PR into develop titled "Application documents: private bucket policies, admin viewer with 5-minute signed URLs, veteran verification, editable upload copy".
