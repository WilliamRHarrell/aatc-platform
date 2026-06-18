# AATC Platform — Editable Page Content (Phase 1: Prose CMS)

**Date:** 2026-06-18
**Status:** Approved design, ready for implementation plan
**Predecessor handoff:** "AATC Platform — Content Management Handoff" (Option A chosen)

---

## Goal

Let Ryan (and future non-technical co-editors) edit the **prose/wording** on every
public marketing page without a code change or redeploy. Editing becomes a database
write through a friendly admin screen; public pages pick the change up within ~60s.

## Decisions (settled with the owner)

| Decision | Choice |
|---|---|
| Approach | Supabase `page_content` table + `/admin/content` editor (handoff Option A) |
| Content scope | **All prose** on all 5 public marketing pages |
| Structured data (ticket tiers, schedule, contest categories) | **Deferred to Phase 2** — stays code-managed |
| Format | Markdown (rendered safely; no raw HTML) |
| Edit freshness | ~60s server revalidate |
| Editors | Built for non-technical co-editors (labels, help text, live preview) |
| Sub-pages (`/sponsors/packages`, `/apply/artist`, `/apply/vendor`) | Out of Phase 1 |

## In scope (Phase 1)

Prose on these pages (`/` redirects to `/apply`, so "home" == apply page):

- **`/apply` (home)** — pre-registration eyebrow, hero title, event-details line
  (dates / venue / city), countdown heading + "opening" line, "What to Expect"
  section title + 3 step titles/descriptions, footer lines.
- **`/tickets`** — header eyebrow/title/intro, "Admission Passes" / "Schedule of
  Events" / "Tattoo Contest Categories" section titles + their subtitles, the
  Ticketmaster-fee footnote, "Questions about tickets?" footer + contact line.
- **`/contests`** — header title + subtitle, "voting opens soon" empty state,
  "thank you for voting" state.
- **`/sponsors`** — header eyebrow/title/intro blurb, "Interested in sponsoring?"
  CTA blurb, empty state.

## Out of scope (Phase 2 / later)

- Repeatable/typed editors for ticket tiers (label/date/price/desc), the 3-day
  schedule, and contest-category lists. These arrays stay defined in code in Phase 1.
- Live DB-driven lists (sponsor grid, contest entries) — already data-driven, not copy.
- Admin/portal app pages (software, not content).
- On-demand revalidation (`revalidatePath` on save), rich-text WYSIWYG editor.

---

## Architecture

### Server shell + client islands

Each public page is currently a single `'use client'` component. Phase 1 converts
each to a thin **server component** that calls `getContent()`, renders the prose,
and mounts **client islands** only where interactivity exists:

| Page | Server-rendered prose | Client island(s) retained |
|---|---|---|
| `/apply` | eyebrow, hero title, event details, "What to Expect", footer | `<Countdown>` timer |
| `/tickets` | header + section titles + subtitles + footnotes | card hover behavior (small island) |
| `/contests` | header title/subtitle, empty + thank-you states | voting grid + lightbox |
| `/sponsors` | header eyebrow/title/intro, CTA blurb, empty state | live sponsor grid |

Interactive islands receive any needed copy as props from the server shell.
The existing client logic (countdown math, voting, lightbox, DB fetches) is preserved
verbatim — only the prose extraction and the server/client boundary change.

### Content registry (source of truth for structure)

`src/content/registry.ts` defines, per `pageKey` → `sectionKey`:

```ts
type Section = {
  label: string        // human label shown in the editor, e.g. "Hero title"
  help?: string        // guidance for the editor
  type: 'text' | 'markdown'
  default: string      // the CURRENT hardcoded copy — fallback + seed value
}
type PageContentSchema = Record<string, Record<string, Section>>
```

The registry — not the database — owns which sections exist. This yields:

1. **Self-describing editor.** `/admin/content` renders fields from the registry,
   so every section shows a friendly label + help, never a raw key.
2. **No blank pages.** `getContent()` returns the DB value *or* the registry
   `default`. The migration is safe to ship before any row exists.
3. **Seedable.** The DB can be pre-populated from registry defaults.

### Read path: `getContent()`

`src/content/getContent.ts` exports an async, cached helper:

```ts
// cached with Next revalidate: 60 (server-side)
getContent(pageKey: string): Promise<Record<string, string>>
```

It fetches all rows for `page_key`, builds `{ section_key: content }`, and **merges
over the registry defaults** so every known section always has a value. Uses the
Supabase server client; public RLS read policy applies.

### Render path: `<Markdown>`

One shared `src/components/Markdown.tsx`, built on `react-markdown` + `remark-gfm`,
renders markdown safely (no raw HTML). Sections typed `text` render as a plain
string (and an inline variant avoids wrapping a heading in a `<p>`); sections typed
`markdown` render through `<Markdown>`. The section's `type` in the registry decides
which. Headings/short labels are `text`; multi-sentence blurbs that may want
bold/links/lists are `markdown`.

---

## Data model

```sql
create table public.page_content (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  content text,
  content_type text default 'text',     -- 'text' | 'markdown'
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id),
  unique (page_key, section_key)
);
alter table public.page_content enable row level security;

create policy "anyone reads content" on public.page_content
  for select using (true);

create policy "admins write content" on public.page_content
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
```

Added as the next sequential migration; regenerate Supabase types into
`src/types/database.ts` afterward.

---

## The editor — `/admin/content`

- Lives under the existing admin layout/route group; gated to admins by the
  existing mechanism. New sidebar entry in `AdminShell.tsx` (same pattern as the
  AATC Generator / Queue links).
- **Page picker** (from registry page keys) → **section list** for that page.
- Each section is a labeled field: label + help text, a textarea, and a **live
  markdown preview** rendered with the same `<Markdown>` component the public site
  uses (so the preview is faithful). `text` sections show a plain preview.
- **Save** upserts the `(page_key, section_key)` row (sets `content`,
  `content_type` from registry, `updated_by`). Writes use the **existing admin
  write pattern** in this codebase (to be confirmed during planning — server action
  vs. client Supabase call) and are RLS-enforced. Toast on success/error.
- Edits appear on public pages within ~60s (time-based revalidate). On-demand
  revalidation is out of scope for Phase 1.

---

## Rollout order

1. Migration (`page_content`) + regenerate types.
2. `src/content/registry.ts` (all Phase-1 sections, defaults = current copy).
3. `getContent()` helper + `<Markdown>` component.
4. `/admin/content` editor + `AdminShell` nav entry.
5. **Convert `/apply` (home) first** — prove the full edit loop end-to-end
   (edit in admin → save → see it change on the public page).
6. Convert `/tickets`, `/contests`, `/sponsors` using the same pattern.

`npm run build` must pass locally before every push (Vercel build is strict).

---

## Testing / verification

- **Build:** `npm run build` green locally at each step.
- **Fallback:** with an empty `page_content` table, every page renders identical
  copy to today (defaults). Verify before seeding.
- **Edit loop:** change a section in `/admin/content`, save, confirm it appears on
  the public page within the revalidate window.
- **Auth:** non-admin cannot write (RLS rejects); public can read.
- **Markdown safety:** a section containing raw HTML does not execute; markdown
  formatting (bold/links/lists) renders as expected.
- **No regressions:** countdown, voting, lightbox, and live sponsor/contest grids
  still work after the server/client split.

## Risks

- **Server/client refactor** of 4 working pages is the bulk of the effort and the
  main regression risk — mitigated by converting `/apply` first and verifying before
  expanding, and by preserving interactive logic verbatim inside islands.
- **Markdown-in-headings** wrapping: handled via an inline/text rendering variant.
