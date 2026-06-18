# Editable Page Content (Phase 1: Prose CMS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit the prose on all 5 public marketing pages from `/admin/content` without a redeploy; public pages read the copy server-side and refresh within ~60s.

**Architecture:** A code-side **registry** owns the structure (which sections exist, their labels/help/type/default copy); a Supabase `page_content` table owns the values. A cached `getContent(pageKey)` helper merges DB values over registry defaults. Each public page becomes a thin **server component** that fetches content and passes it to a **client child** (preserving all existing interactivity). A `/admin/content` editor renders fields from the registry, shows a live markdown preview, and upserts rows (RLS-gated to admins).

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (`@supabase/supabase-js` + auth-helpers), `react-markdown` + `remark-gfm`, `react-hot-toast`, Tailwind + inline styles.

**Spec:** [docs/superpowers/specs/2026-06-18-page-content-cms-design.md](../specs/2026-06-18-page-content-cms-design.md)

---

## Testing approach (read first)

This codebase has **no unit-test runner** (scripts are only `dev`/`build`/`start`/`lint`). Per the project's established practice (HANDOFF.md), the verification gate for every task is:

1. **`npm run build`** must pass (Vercel's build is strict — this is the hard gate).
2. **Manual runtime checks** where noted (run `npm run dev`, exercise the page).

So the usual TDD "write failing test first" is adapted to: **make the change → build green → manual check → commit.** Where a pure function has a cheap scriptable check (e.g. `getContent` fallback), a throwaway `node`/`tsx` snippet is given instead of a test file.

**Conventions to follow (already in this repo):**
- Admin pages are `'use client'`, get a client via `import { createClient } from '@/lib/supabase'`, call `.upsert()/.update()`, and toast with `react-hot-toast`. RLS enforces admin-only writes.
- Public pages currently are `'use client'`. We convert each to a server `page.tsx` that renders a `*Client` child — the child keeps `'use client'` and all current interactivity, but reads prose from a `content` prop instead of hardcoded strings.
- Keep existing `<span className="text-emboss">` wrappers; put `{content.key}` (or `<Markdown>`) inside them so the text-shadow styling is preserved.
- Brand colors: tan `#C4A882`, bronze `#8B7355`, bg `#0a0a0a`/`#111`/`#1a1a1a`, borders `#2a2a2a`.

---

## Task 1: Database migration + types

**Files:**
- Create: `supabase/migrations/026_page_content.sql`
- Modify: `src/types/database.ts` (add `page_content` table type)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/026_page_content.sql`:

```sql
-- Editable page content (Phase 1: prose CMS)
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

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Apply it the same way the project applies migrations: open the Supabase SQL Editor for project `srlgjovefsmtkxthtjkz` and run the SQL above (or `npx supabase db push` if the CLI is linked). Confirm the table exists:

Run (Supabase SQL editor): `select count(*) from public.page_content;`
Expected: returns `0` (table exists, empty).

- [ ] **Step 3: Regenerate Supabase types (preferred), or hand-add the type**

Preferred:

```bash
npx supabase gen types typescript --project-id srlgjovefsmtkxthtjkz > src/types/database.ts
```

If the CLI is unavailable/unlinked, hand-add this table to the `Tables` section of `src/types/database.ts` (match the existing generated shape — `Row`/`Insert`/`Update`/`Relationships`):

```ts
page_content: {
  Row: {
    id: string
    page_key: string
    section_key: string
    content: string | null
    content_type: string | null
    updated_at: string | null
    updated_by: string | null
  }
  Insert: {
    id?: string
    page_key: string
    section_key: string
    content?: string | null
    content_type?: string | null
    updated_at?: string | null
    updated_by?: string | null
  }
  Update: {
    id?: string
    page_key?: string
    section_key?: string
    content?: string | null
    content_type?: string | null
    updated_at?: string | null
    updated_by?: string | null
  }
  Relationships: []
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS (types compile).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/026_page_content.sql src/types/database.ts
git commit -m "feat(content): add page_content table + types"
```

---

## Task 2: Install markdown dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install react-markdown remark-gfm`
Expected: adds both to `dependencies`, no peer-dep errors against React 19.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown + remark-gfm"
```

---

## Task 3: `<Markdown>` component

**Files:**
- Create: `src/components/Markdown.tsx`

Renders markdown safely (react-markdown does **not** render raw HTML unless `rehype-raw` is added — we don't add it, so embedded HTML is shown as inert text). An `inline` prop strips the wrapping `<p>` so it can be used inside headings/spans without breaking layout.

- [ ] **Step 1: Write the component**

Create `src/components/Markdown.tsx`:

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Safe markdown renderer for editable page content.
 * - No raw HTML execution (rehype-raw intentionally NOT used).
 * - `inline`: render children without a block <p> wrapper (for headings/labels).
 */
export default function Markdown({
  children,
  inline = false,
  className,
}: {
  children: string
  inline?: boolean
  className?: string
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Inline mode: unwrap the paragraph so we don't inject block boxes.
        p: ({ children }) => (inline ? <>{children}</> : <p className={className}>{children}</p>),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: '#C4A882' }}
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/Markdown.tsx
git commit -m "feat(content): safe Markdown renderer with inline variant"
```

---

## Task 4: Content registry

**Files:**
- Create: `src/content/registry.ts`

The single source of truth for which sections exist on each page. `default` = the exact copy that is hardcoded today (so pages never render blank and the table can be seeded). `type: 'markdown'` is used only for multi-sentence blurbs that may want bold/links/lists; everything else is `'text'`.

- [ ] **Step 1: Write the registry**

Create `src/content/registry.ts`:

```ts
export type ContentType = 'text' | 'markdown'

export interface Section {
  label: string
  help?: string
  type: ContentType
  default: string
}

export type PageContentSchema = Record<string, Section>

export interface PageDef {
  key: string
  title: string // shown in the admin editor page-picker
  sections: PageContentSchema
}

export const REGISTRY: PageDef[] = [
  {
    key: 'home',
    title: 'Home / Pre-Register (/apply)',
    sections: {
      hero_eyebrow: { label: 'Hero eyebrow', type: 'text', default: 'Pre-Registration' },
      hero_title: { label: 'Hero title', type: 'text', default: 'Pre-Register for AATC' },
      hero_title_accent: { label: 'Hero title (gold accent)', type: 'text', default: 'Fayetteville 2027' },
      event_dates: { label: 'Event dates', type: 'text', default: 'Apr 16–18, 2027' },
      event_venue: { label: 'Venue name', help: 'Links to the venue map (link is fixed in code).', type: 'text', default: 'Crown Complex' },
      event_location: { label: 'City/State', type: 'text', default: 'Fayetteville, NC' },
      countdown_heading: { label: 'Countdown heading', type: 'text', default: 'Pre-Registration Opens In' },
      countdown_opens_text: { label: 'Countdown "opening" line', help: 'Display text only. The actual countdown target date is set in code.', type: 'text', default: 'Opening June 1, 2026' },
      countdown_calendar_cta: { label: 'Calendar link label', type: 'text', default: 'Mark Your Calendar' },
      cta_artist: { label: 'CTA — Artist button', type: 'text', default: 'Apply as Artist' },
      cta_vendor: { label: 'CTA — Vendor button', type: 'text', default: 'Apply as Vendor' },
      cta_sponsor: { label: 'CTA — Sponsor button', type: 'text', default: 'Become A Sponsor' },
      expect_title: { label: '"What to Expect" title', type: 'text', default: 'What to Expect When Applying' },
      expect_step1_title: { label: 'Step 1 title', type: 'text', default: 'Submit your application' },
      expect_step1_desc: { label: 'Step 1 description', type: 'markdown', default: 'Fill out a short form with your business info, preferred booth size, and artist count. No payment required upfront.' },
      expect_step2_title: { label: 'Step 2 title', type: 'text', default: 'Review and approval' },
      expect_step2_desc: { label: 'Step 2 description', type: 'markdown', default: 'Our team reviews every application. Approved applicants receive a confirmation email with their invoice and booth assignment.' },
      expect_step3_title: { label: 'Step 3 title', type: 'text', default: 'Secure your spot' },
      expect_step3_desc: { label: 'Step 3 description', type: 'markdown', default: 'Pay your invoice online via Stripe to lock in your booth. A printable confirmation and floor plan are available in your exhibitor portal.' },
      footer_name: { label: 'Footer name', type: 'text', default: 'ALL AMERICAN TATTOO CONVENTION' },
      footer_location: { label: 'Footer location', type: 'text', default: 'Crown Complex Event Center · Fayetteville, NC' },
    },
  },
  {
    key: 'tickets',
    title: 'Tickets (/tickets)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'April 16–18, 2027 · Fayetteville, NC' },
      header_title: { label: 'Header title', type: 'text', default: 'Buy Tickets' },
      header_intro: { label: 'Header intro', type: 'markdown', default: 'Secure your spot at the All American Tattoo Convention. Active military and veterans receive a $5 discount at the door with valid ID.' },
      passes_title: { label: '"Admission Passes" title', type: 'text', default: 'Admission Passes' },
      passes_footnote: { label: 'Passes footnote', type: 'markdown', default: 'Online purchases are subject to Ticketmaster service fees. To avoid fees, tickets may be purchased in person at the on-base Ft Bragg ticket office or the Crown Complex box office.' },
      schedule_title: { label: '"Schedule" title', type: 'text', default: 'Schedule of Events' },
      schedule_subtitle: { label: 'Schedule subtitle', type: 'text', default: 'Schedule is subject to change. Check back for updates.' },
      categories_title: { label: '"Contest Categories" title', type: 'text', default: 'Tattoo Contest Categories' },
      categories_subtitle: { label: 'Categories subtitle', type: 'text', default: 'Categories are subject to change. Final categories will be announced closer to the event.' },
      questions_title: { label: 'Questions title', type: 'text', default: 'Questions about tickets?' },
      questions_body: { label: 'Questions body', type: 'markdown', default: 'Contact us at [info@allamericantattooconvention.com](mailto:info@allamericantattooconvention.com)' },
    },
  },
  {
    key: 'contests',
    title: 'Contests (/contests)',
    sections: {
      header_title: { label: 'Header title', type: 'text', default: 'Tattoo Collectors Award' },
      header_subtitle: { label: 'Header subtitle', type: 'text', default: "People's Choice · Vote for your favorite in each category" },
      vote_hint: { label: 'Per-category vote hint', type: 'text', default: 'Tap a photo to enlarge · Select your favorite to vote' },
      empty_title: { label: 'Empty-state title', type: 'text', default: 'Voting opens soon' },
      empty_body: { label: 'Empty-state body', type: 'markdown', default: 'Check back after the convention to cast your votes.' },
      thankyou_title: { label: 'Thank-you title', type: 'text', default: 'Thank you for voting!' },
      thankyou_body: { label: 'Thank-you body', type: 'markdown', default: 'Your votes have been recorded. Winners will be announced at AATC 2027.' },
    },
  },
  {
    key: 'sponsors',
    title: 'Sponsors (/sponsors)',
    sections: {
      header_eyebrow: { label: 'Header eyebrow', type: 'text', default: 'Support Our Tattooed Military' },
      header_title: { label: 'Header title', type: 'text', default: 'Sponsor Directory' },
      header_intro: { label: 'Header intro', type: 'markdown', default: 'Thank you to our incredible sponsors who make the All American Tattoo Convention possible. Your support directly benefits our tattooed military community.' },
      empty_body: { label: 'Empty-state body', type: 'text', default: 'No sponsors confirmed yet for this event.' },
      cta_body: { label: 'CTA body', type: 'text', default: 'Interested in sponsoring AATC 2027?' },
      cta_button: { label: 'CTA button label', type: 'text', default: 'View Sponsorship Packages' },
    },
  },
]

export function getPageDef(pageKey: string): PageDef | undefined {
  return REGISTRY.find(p => p.key === pageKey)
}

/** Map of section_key -> default value for a page (used as fallback + seed). */
export function defaultsFor(pageKey: string): Record<string, string> {
  const def = getPageDef(pageKey)
  if (!def) return {}
  return Object.fromEntries(Object.entries(def.sections).map(([k, s]) => [k, s.default]))
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content/registry.ts
git commit -m "feat(content): page/section registry with defaults"
```

---

## Task 5: `getContent()` cached read helper

**Files:**
- Create: `src/content/getContent.ts`

Uses a **cookieless** anon Supabase client (so it can be cached — the cookie-based `createServerClient` opts out of caching). Wrapped in `unstable_cache` with `revalidate: 60` and a `page_content` tag. Returns DB values merged over registry defaults, so every known section always has a value.

- [ ] **Step 1: Write the helper**

Create `src/content/getContent.ts`:

```ts
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { defaultsFor } from './registry'

/** Cookieless anon client — safe for public reads and cacheable. */
function readClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const cachedRows = unstable_cache(
  async (pageKey: string) => {
    const supabase = readClient()
    const { data } = await supabase
      .from('page_content')
      .select('section_key, content')
      .eq('page_key', pageKey)
    return data ?? []
  },
  ['page_content'],
  { revalidate: 60, tags: ['page_content'] }
)

/**
 * Returns { section_key: value } for a page, DB values merged over registry
 * defaults. Always includes every registry section, so pages never render blank.
 */
export async function getContent(pageKey: string): Promise<Record<string, string>> {
  const merged = defaultsFor(pageKey)
  const rows = await cachedRows(pageKey)
  for (const row of rows) {
    if (row.content != null && row.content !== '') merged[row.section_key] = row.content
  }
  return merged
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual fallback check**

With the `page_content` table empty, `getContent('home')` must return all registry defaults. Verify after Task 7 wires it into the page (the `/apply` page rendering identical copy to today proves the fallback). No separate harness needed.

- [ ] **Step 4: Commit**

```bash
git add src/content/getContent.ts
git commit -m "feat(content): cached getContent() merging DB over defaults"
```

---

## Task 6: `/admin/content` editor + sidebar nav

**Files:**
- Create: `src/app/admin/content/page.tsx`
- Modify: `src/components/admin/AdminShell.tsx` (add nav entry)

The editor is a client component (matching every other admin page). It renders fields from the registry, loads current values from `page_content`, shows a live preview, and upserts on save. RLS allows the write only for admins.

- [ ] **Step 1: Add the sidebar nav entry**

In `src/components/admin/AdminShell.tsx`, add this object to the `NAV` array (place it after the `/admin/aatc-queue` entry, before the closing `]`):

```tsx
  {
    href: '/admin/content',
    label: 'Page Content',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
  },
```

- [ ] **Step 2: Write the editor page**

Create `src/app/admin/content/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { REGISTRY, getPageDef } from '@/content/registry'
import Markdown from '@/components/Markdown'

export default function AdminContentPage() {
  const supabase = createClient()
  const [pageKey, setPageKey] = useState(REGISTRY[0].key)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const pageDef = getPageDef(pageKey)!

  // Load current values for the selected page (default-filled from registry).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const base: Record<string, string> = Object.fromEntries(
        Object.entries(pageDef.sections).map(([k, s]) => [k, s.default])
      )
      const { data } = await supabase
        .from('page_content')
        .select('section_key, content')
        .eq('page_key', pageKey)
      ;(data ?? []).forEach(r => {
        if (r.content != null) base[r.section_key] = r.content
      })
      if (!cancelled) {
        setValues(base)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [pageKey])

  const save = async (sectionKey: string) => {
    setSavingKey(sectionKey)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('page_content')
      .upsert(
        {
          page_key: pageKey,
          section_key: sectionKey,
          content: values[sectionKey] ?? '',
          content_type: pageDef.sections[sectionKey].type,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: 'page_key,section_key' }
      )
    setSavingKey(null)
    if (error) {
      toast.error('Save failed — are you an admin?')
    } else {
      toast.success('Saved · live within ~60s')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-white">Page Content</h1>
      <p className="mt-1 text-sm" style={{ color: '#999' }}>
        Edit the wording on your public pages. Changes appear within about a minute.
      </p>

      {/* Page picker */}
      <div className="mt-5 flex flex-wrap gap-2">
        {REGISTRY.map(p => (
          <button
            key={p.key}
            onClick={() => setPageKey(p.key)}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: pageKey === p.key ? 'rgba(139,115,85,0.15)' : '#1a1a1a',
              color: pageKey === p.key ? '#C4A882' : '#999',
              border: `1px solid ${pageKey === p.key ? 'rgba(139,115,85,0.3)' : '#2a2a2a'}`,
            }}
          >
            {p.title}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2" style={{ borderColor: '#8B7355', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(pageDef.sections).map(([key, section]) => (
            <div key={key} className="rounded-2xl p-5" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm font-semibold text-white">{section.label}</label>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>{section.type}</span>
              </div>
              {section.help && (
                <p className="mt-0.5 text-xs" style={{ color: '#666' }}>{section.help}</p>
              )}
              <textarea
                value={values[key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                rows={section.type === 'markdown' ? 4 : 2}
                className="mt-2 w-full rounded-lg p-3 text-sm text-white"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a' }}
              />

              {/* Live preview */}
              <div className="mt-2 rounded-lg p-3 text-sm" style={{ backgroundColor: '#0a0a0a', border: '1px dashed #2a2a2a', color: '#ccc' }}>
                <p className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>Preview</p>
                {section.type === 'markdown'
                  ? <Markdown>{values[key] ?? ''}</Markdown>
                  : <span>{values[key]}</span>}
              </div>

              <button
                onClick={() => save(key)}
                disabled={savingKey === key}
                className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#8B7355' }}
              >
                {savingKey === key ? 'Saving…' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run `npm run dev`, sign in as admin (`ryan@americantattoosociety.com`), visit `/admin/content`. Expected: "Page Content" appears in the sidebar; each page tab shows its sections pre-filled with current copy; editing a markdown field updates the preview; clicking Save shows the success toast and (re-loading the page) the value persists.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/content/page.tsx src/components/admin/AdminShell.tsx
git commit -m "feat(admin): /admin/content editor with live markdown preview"
```

---

## Task 7: Convert `/apply` (home) — proof of the loop

**Files:**
- Create: `src/app/apply/ApplyClient.tsx` (the existing page body, now reading from a `content` prop)
- Modify: `src/app/apply/page.tsx` (becomes a server component that fetches content)

Pattern (used for all four pages): move the current client component into `*Client.tsx`, give it a `content: Record<string,string>` prop, replace each hardcoded prose string with `content.<key>` (or `<Markdown>{content.<key>}</Markdown>` for markdown sections), and make `page.tsx` a thin async server component. All interactivity (the countdown, hover handlers) stays in the client child — **no behavior changes**.

- [ ] **Step 1: Create `ApplyClient.tsx`**

Copy the entire current body of `src/app/apply/page.tsx` into `src/app/apply/ApplyClient.tsx`. Keep `'use client'` and the `useCountdown`/`CountdownUnit` helpers and `REGISTRATION_OPENS` exactly as they are. Then:

- Change the component signature to accept content:

```tsx
export default function ApplyClient({ content }: { content: Record<string, string> }) {
  const c = content
  const timeLeft = useCountdown(REGISTRATION_OPENS)
  // ...rest unchanged except the string swaps below
}
```

- Add the Markdown import at the top: `import Markdown from '@/components/Markdown'`
- Replace the prose using this exact mapping (left = current hardcoded text, right = replacement):

| Current JSX text | Replace with |
|---|---|
| `Pre-Registration` (hero eyebrow) | `{c.hero_eyebrow}` |
| `Pre-Register for AATC` | `{c.hero_title}` |
| ` Fayetteville 2027` | `{c.hero_title_accent}` |
| `Apr 16–18, 2027` | `{c.event_dates}` |
| `Crown Complex` (link text) | `{c.event_venue}` |
| `Fayetteville, NC` | `{c.event_location}` |
| `Pre-Registration Opens In` | `{c.countdown_heading}` |
| `Opening June 1, 2026 —` | `{c.countdown_opens_text} —` |
| `Mark Your Calendar` | `{c.countdown_calendar_cta}` |
| `Apply as Artist` | `{c.cta_artist}` |
| `Apply as Vendor` | `{c.cta_vendor}` |
| `Become A Sponsor` | `{c.cta_sponsor}` |
| `What to Expect When Applying` | `{c.expect_title}` |

- For the three "What to Expect" steps, replace the hardcoded `title`/`desc` strings in the array with content keys, and render `desc` through Markdown. Change the array to:

```tsx
{[
  { icon: (/* keep step 1 icon */), title: c.expect_step1_title, desc: c.expect_step1_desc },
  { icon: (/* keep step 2 icon */), title: c.expect_step2_title, desc: c.expect_step2_desc },
  { icon: (/* keep step 3 icon */), title: c.expect_step3_title, desc: c.expect_step3_desc },
].map(({ icon, title, desc }) => (
  // ...inside the <li>, replace the desc <p> body:
  // <p className="mt-1 text-sm leading-relaxed" style={{ color: '#999999' }}>{desc}</p>
  // with:
  <p className="mt-1 text-sm leading-relaxed" style={{ color: '#999999' }}>
    <Markdown inline>{desc}</Markdown>
  </p>
))}
```

(Keep the `<p className="font-semibold text-white">{title}</p>` line as-is — `title` is now a content value.)

- Footer replacements:

| Current JSX text | Replace with |
|---|---|
| `ALL AMERICAN TATTOO CONVENTION` (footer) | `{c.footer_name}` |
| `Crown Complex Event Center · Fayetteville, NC` (footer) | `{c.footer_location}` |

Leave the `© {new Date().getFullYear()} ...` copyright line unchanged (auto-year, not editable in Phase 1).

- [ ] **Step 2: Rewrite `page.tsx` as a server component**

Replace the entire contents of `src/app/apply/page.tsx` with:

```tsx
import { getContent } from '@/content/getContent'
import ApplyClient from './ApplyClient'

export default async function ApplyPage() {
  const content = await getContent('home')
  return <ApplyClient content={content} />
}
```

(Remove the old `'use client'`, the imports it no longer needs, and the hooks — those now live in `ApplyClient.tsx`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS. (If the build complains that `page.tsx` still imports `useState`/`Link`, you left client-only code in the server file — move it to `ApplyClient.tsx`.)

- [ ] **Step 4: Manual end-to-end loop check (the proof)**

Run `npm run dev`:
1. Visit `/apply` (and `/`, which redirects there). Expected: **identical** to before (defaults render — confirms fallback).
2. In `/admin/content`, Home tab, change "Hero title" to e.g. `Pre-Register Now` and Save.
3. Reload `/apply` after ~60s (or restart `npm run dev` to bust the cache immediately). Expected: the new hero title shows. The countdown still ticks. CTA button hovers still work.

- [ ] **Step 5: Commit**

```bash
git add src/app/apply/page.tsx src/app/apply/ApplyClient.tsx
git commit -m "feat(content): /apply reads prose from page_content (proof of loop)"
```

---

## Task 8: Convert `/tickets`

**Files:**
- Create: `src/app/tickets/TicketsClient.tsx`
- Modify: `src/app/tickets/page.tsx`

The `TICKETS`, `SCHEDULE`, and `CONTEST_CATEGORIES` arrays stay in code (Phase 2). Only prose moves to content.

- [ ] **Step 1: Create `TicketsClient.tsx`**

Move the entire current body of `src/app/tickets/page.tsx` into `src/app/tickets/TicketsClient.tsx`. Keep `'use client'` and the `TICKETS`/`SCHEDULE`/`CONTEST_CATEGORIES` constants and all hover handlers. Change the signature and add the Markdown import:

```tsx
import Markdown from '@/components/Markdown'

export default function TicketsClient({ content }: { content: Record<string, string> }) {
  const c = content
  // ...rest unchanged except the string swaps below
}
```

Prose replacements:

| Current JSX text | Replace with |
|---|---|
| `April 16–18, 2027 · Fayetteville, NC` (eyebrow) | `{c.header_eyebrow}` |
| `Buy Tickets` | `{c.header_title}` |
| `Secure your spot at the All American Tattoo Convention. Active military and veterans receive a $5 discount at the door with valid ID.` | `<Markdown inline>{c.header_intro}</Markdown>` |
| `Admission Passes` | `{c.passes_title}` |
| `Online purchases are subject to Ticketmaster service fees. To avoid fees, tickets may be purchased in person at the on-base Ft Bragg ticket office or the Crown Complex box office.` | `<Markdown inline>{c.passes_footnote}</Markdown>` |
| `Schedule of Events` | `{c.schedule_title}` |
| `Schedule is subject to change. Check back for updates.` | `{c.schedule_subtitle}` |
| `Tattoo Contest Categories` | `{c.categories_title}` |
| `Categories are subject to change. Final categories will be announced closer to the event.` | `{c.categories_subtitle}` |
| `Questions about tickets?` | `{c.questions_title}` |
| The "Contact us at …" block (the `<a mailto>`) | `<Markdown inline>{c.questions_body}</Markdown>` |

For the questions body, replace the whole inner `<span className="text-emboss">Contact us at … </a></span>` with `<span className="text-emboss"><Markdown inline>{c.questions_body}</Markdown></span>` (the mailto link comes from the markdown).

- [ ] **Step 2: Rewrite `page.tsx`**

Replace `src/app/tickets/page.tsx` with:

```tsx
import { getContent } from '@/content/getContent'
import TicketsClient from './TicketsClient'

export default async function TicketsPage() {
  const content = await getContent('tickets')
  return <TicketsClient content={content} />
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

`npm run dev` → `/tickets` renders identical to before; edit "Header title" in `/admin/content` (Tickets tab), save, confirm it changes after cache refresh. Ticket card hovers and links still work.

- [ ] **Step 5: Commit**

```bash
git add src/app/tickets/page.tsx src/app/tickets/TicketsClient.tsx
git commit -m "feat(content): /tickets reads prose from page_content"
```

---

## Task 9: Convert `/contests`

**Files:**
- Create: `src/app/contests/ContestsClient.tsx`
- Modify: `src/app/contests/page.tsx`

Per-contest `name`/`description` stay from the DB (dynamic). Only static prose moves to content.

- [ ] **Step 1: Create `ContestsClient.tsx`**

Move the entire current body of `src/app/contests/page.tsx` into `src/app/contests/ContestsClient.tsx`. Keep `'use client'`, the `Lightbox`, voter-token helpers, all `useState`/`useEffect`/`castVote` logic. Change the signature and add the Markdown import:

```tsx
import Markdown from '@/components/Markdown'

export default function ContestsClient({ content }: { content: Record<string, string> }) {
  const c = content
  // ...rest unchanged except the string swaps below
}
```

Prose replacements:

| Current JSX text | Replace with |
|---|---|
| `Tattoo Collectors Award` | `{c.header_title}` |
| `People's Choice · Vote for your favorite in each category` (`People&apos;s Choice …`) | `{c.header_subtitle}` |
| `Tap a photo to enlarge · Select your favorite to vote` | `{c.vote_hint}` |
| `Voting opens soon` | `{c.empty_title}` |
| `Check back after the convention to cast your votes.` | `<Markdown inline>{c.empty_body}</Markdown>` |
| `Thank you for voting!` | `{c.thankyou_title}` |
| `Your votes have been recorded. Winners will be announced at AATC 2027.` | `<Markdown inline>{c.thankyou_body}</Markdown>` |

Leave `{contest.name}`, `{contest.description}`, `{votedCount} of {contests.length} …`, and `Tattoo by {entry.artist_name}` unchanged (dynamic data).

- [ ] **Step 2: Rewrite `page.tsx`**

Replace `src/app/contests/page.tsx` with:

```tsx
import { getContent } from '@/content/getContent'
import ContestsClient from './ContestsClient'

export default async function ContestsPage() {
  const content = await getContent('contests')
  return <ContestsClient content={content} />
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

`npm run dev` → `/contests` renders identical (the empty-state "Voting opens soon" is the easiest to see if there are no entries). Edit "Empty-state title" in `/admin/content`, save, confirm change. Voting/lightbox still work if entries exist.

- [ ] **Step 5: Commit**

```bash
git add src/app/contests/page.tsx src/app/contests/ContestsClient.tsx
git commit -m "feat(content): /contests reads prose from page_content"
```

---

## Task 10: Convert `/sponsors`

**Files:**
- Create: `src/app/sponsors/SponsorsClient.tsx`
- Modify: `src/app/sponsors/page.tsx`

The live sponsor grid + tier metadata stay in the client component (dynamic DB data).

- [ ] **Step 1: Create `SponsorsClient.tsx`**

Move the entire current body of `src/app/sponsors/page.tsx` into `src/app/sponsors/SponsorsClient.tsx`. Keep `'use client'`, `TIER_ORDER`, `TIER_META`, all fetch/grouping logic. Change the signature and add the Markdown import:

```tsx
import Markdown from '@/components/Markdown'

export default function SponsorsClient({ content }: { content: Record<string, string> }) {
  const c = content
  // ...rest unchanged except the string swaps below
}
```

Prose replacements:

| Current JSX text | Replace with |
|---|---|
| `Support Our Tattooed Military` | `{c.header_eyebrow}` |
| `Sponsor Directory` | `{c.header_title}` |
| `Thank you to our incredible sponsors who make the All American Tattoo Convention possible. Your support directly benefits our tattooed military community.` | `<Markdown inline>{c.header_intro}</Markdown>` |
| `No sponsors confirmed yet for this event.` | `{c.empty_body}` |
| `Interested in sponsoring AATC 2027?` | `{c.cta_body}` |
| `View Sponsorship Packages` | `{c.cta_button}` |

Leave `{s.sponsor_name}`, `{meta.label}`, and tier rendering unchanged (dynamic).

- [ ] **Step 2: Rewrite `page.tsx`**

Replace `src/app/sponsors/page.tsx` with:

```tsx
import { getContent } from '@/content/getContent'
import SponsorsClient from './SponsorsClient'

export default async function SponsorsPage() {
  const content = await getContent('sponsors')
  return <SponsorsClient content={content} />
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

`npm run dev` → `/sponsors` renders identical. Edit "Header title" in `/admin/content`, save, confirm change. The live sponsor grid (or empty state) still renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/sponsors/page.tsx src/app/sponsors/SponsorsClient.tsx
git commit -m "feat(content): /sponsors reads prose from page_content"
```

---

## Task 11: Final verification & push

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS, all four public pages prerendered/compiled.

- [ ] **Step 2: Markdown safety check**

In `/admin/content`, set a markdown section (e.g. tickets `header_intro`) to `**bold** and a [link](https://example.com) and <script>alert(1)</script>`, save. On `/tickets`: "bold" renders bold, the link renders as a link, and the `<script>` tag appears as inert text (not executed). Revert the change.

- [ ] **Step 3: Non-admin write check (optional, if a non-admin test user exists)**

Signed in as a non-admin, a `page_content` upsert is rejected by RLS (the editor shows the "Save failed — are you an admin?" toast). Public pages still read fine.

- [ ] **Step 4: Push**

```bash
git push origin develop
```

Then confirm the Vercel deploy on `develop` goes green and the public pages on `aatc-platform.vercel.app` are unchanged (defaults) until content is edited.

---

## Self-review notes

- **Spec coverage:** migration + RLS (Task 1), markdown format (Tasks 2–3), registry/defaults/no-blank-pages (Task 4), cached `getContent` ~60s (Task 5), friendly editor + nav + preview (Task 6), server-shell + client-child conversion of all 5 pages — home/apply, tickets, contests, sponsors (Tasks 7–10), testing/markdown-safety/auth (Task 11). Structured tables, sub-pages, on-demand revalidation, WYSIWYG correctly excluded (Phase 2).
- **Naming consistency:** `getContent`, `defaultsFor`, `getPageDef`, `REGISTRY`, `content`/`c` prop, `*Client.tsx` children, `page_content`, section keys — used identically across all tasks.
- **No placeholders:** every code step shows real code; the only intentional "keep as-is" references point at existing, already-written page markup (icons/logic) that must be preserved verbatim.
