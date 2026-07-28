# AATC Platform — Handoff Document

**Last session:** 2026-06-28
**Current state:** Phase 1 prose CMS (`feat/page-content-cms`) is **built, build-green, and deployed to production** at https://aatc-platform.vercel.app. The four marketing pages now read their copy from the `page_content` table (with code-default fallback). The table is **empty in prod**, so the live pages currently render the original copy unchanged — they're just editable now via `/admin/content`. Nothing visual changed yet; that's expected and intended.

The purpose of this deploy: get the editable pages live so you can **review them and make notes on copy changes**, then apply those edits from the admin UI.

---

## TL;DR — pick up here

Phase 1 is done and live. Tomorrow's work is **content + housekeeping**, not building:

1. **Review the live pages and edit copy** via `/admin/content` (no redeploy needed — changes show within ~60s).
2. **Decide what to do with the git branch** — it's deployed but *not* pushed to remote or merged (see "Git state" below).
3. **(Optional) seed `page_content`** so the editor shows current copy pre-filled instead of empty placeholders.

### Resume in 3 steps

1. Go to https://aatc-platform.vercel.app/admin/content and sign in as admin (`ryan@americantattoosociety.com` or `malia@allamericantattooconvention.com`).
2. Pick a page from the page-picker (Home/Apply, Tickets, Contests, Sponsors), edit any section — there's a live markdown preview — and Save.
3. Open the public page (e.g. https://aatc-platform.vercel.app/tickets) in incognito; your edit appears within ~60s (the content cache revalidates on a 60s window).

---

## What's editable right now

Four pages are wired to the CMS. The editable sections live in the code registry at [src/content/registry.ts](src/content/registry.ts) — that file is the source of truth for which sections exist, their labels/help text, type (`text` vs `markdown`), and default copy.

| Page key | Public URL | Server shell | Client child |
|---|---|---|---|
| `home` | `/apply` | [src/app/apply/page.tsx](src/app/apply/page.tsx) | [src/app/apply/ApplyClient.tsx](src/app/apply/ApplyClient.tsx) |
| `tickets` | `/tickets` | [src/app/tickets/page.tsx](src/app/tickets/page.tsx) | [src/app/tickets/TicketsClient.tsx](src/app/tickets/TicketsClient.tsx) |
| `contests` | `/contests` | [src/app/contests/page.tsx](src/app/contests/page.tsx) | [src/app/contests/ContestsClient.tsx](src/app/contests/ContestsClient.tsx) |
| `sponsors` | `/sponsors` | [src/app/sponsors/page.tsx](src/app/sponsors/page.tsx) | [src/app/sponsors/SponsorsClient.tsx](src/app/sponsors/SponsorsClient.tsx) |

**Only prose is editable.** Structured data (ticket prices/schedule arrays, contest categories, sponsor rows) stays in code — that's Phase 2 (see plan). To add a new editable section: add it to the registry, then reference `{content.your_key}` (or `<Markdown>{content.your_key}</Markdown>`) in the client child. No DB change needed — `getContent` auto-includes every registry section.

---

## How fallback works (why nothing broke)

[src/content/getContent.ts](src/content/getContent.ts) starts from `defaultsFor(pageKey)` (the registry defaults) and merges any DB rows over the top. So:
- Empty table → pages show registry defaults (current state).
- A row with `content = ''` or `null` → ignored, default still shows.
- A row with real content → overrides the default.

This means **the pages can never render blank**, even if the table is missing or a section is unset.

---

## (Optional) Seed the table with current copy

By default the editor shows empty fields with the default as placeholder. If you'd rather see every section pre-filled with the current live copy (easier to edit in place), seed the table from the registry defaults. Ask the agent to "seed page_content from the registry" — it's a short script that upserts `defaultsFor()` for each page key via the service-role client. Safe to run anytime (idempotent on `(page_key, section_key)`).

Not required — editing an empty field and saving works identically.

---

## Git state — DECISION NEEDED

⚠️ The production deploy was done via the **Vercel CLI** (`vercel --prod`), which is decoupled from git. So the work is **live but not in the remote repo**:

- Branch `feat/page-content-cms` — **local only, not pushed to `origin`**, 13 commits ahead of `origin/develop`.
- Not merged into `develop` or `main`.
- Working tree is clean; all CMS work is committed.

**Before you build anything else, decide how to land this branch.** Options:
- Push + open a PR into `develop`: `git push -u origin feat/page-content-cms` then PR.
- Or merge straight to `develop` if you don't want review: `git checkout develop && git merge feat/page-content-cms && git push`.

Until this is pushed, the only copy of these 13 commits is your local machine. Recommend pushing first thing.

---

## Deploy / rollback (reference)

```bash
# Redeploy current working tree to prod
vercel --prod --yes

# Roll back to the previous production deployment
vercel rollback aatc-platform
```
Last production deployment: `dpl_GxNjTt1iKCMAs5Wxe1MsC9GQy86H` (READY, aliased to aatc-platform.vercel.app). Note: `vercel whoami` must be authenticated first (`vercel login`) — the token had expired this session.

Full runbook: [docs/deployment.md](docs/deployment.md).

---

## Carried-over operational follow-ups (still open from May)

These predate the CMS work and remain unaddressed. **Required before public launch:**

1. **Resend domain verification** — default sender (`onboarding@resend.dev`) only delivers to `ryan@ryanharrell.com`. Verify a domain (recommended `mail.americantattoosociety.com`) at https://resend.com/domains, add SPF+DKIM DNS records, update `RESEND_FROM_EMAIL` env var, redeploy.
2. **Supabase Site URL** — still `http://localhost:3000`. Set Authentication → URL Configuration → Site URL to `https://aatc-platform.vercel.app` and add `https://aatc-platform.vercel.app/**` to the redirect allow-list. Until then, recovery/welcome email links point to localhost.

**Non-blocking:**
3. **Sponsor RLS baseline policy** — migration 001's permissive `using (true)` still allows anon read of all sponsorship rows; app-level queries filter correctly, but a future migration (now **027**, since 026 is `page_content`) should drop the baseline. SQL is in the git history of this file / deployment.md.
4. **Lint** — 17 pre-existing eslint errors; don't block `next build`. Sweep when convenient.

---

## Migration state

- Production has **001 through 026** applied. `026_page_content` confirmed live (table exists, empty) this session via REST query.
- The sponsor-RLS cleanup, if done, would be migration **027**.

---

## Production references

- **Production URL:** https://aatc-platform.vercel.app
- **Vercel project:** `creative-champion/aatc-platform` (linked at `.vercel/project.json`)
- **Supabase project ref:** `srlgjovefsmtkxthtjkz` — https://supabase.com/dashboard/project/srlgjovefsmtkxthtjkz
- **Admins:** `ryan@americantattoosociety.com`, `malia@allamericantattooconvention.com`
- **Content editor:** `/admin/content` — page-picker + per-section fields + live markdown preview

---

## When you resume — short checklist

- [ ] Push the branch: `git push -u origin feat/page-content-cms` (decide: PR vs direct merge to `develop`)
- [ ] Review the 4 live pages; make notes on copy changes
- [ ] Apply copy edits via `/admin/content` (verify each on the public page in incognito, ~60s)
- [ ] (Optional) seed `page_content` from registry defaults for pre-filled editing
- [ ] (When ready) tackle the two launch-blockers: Resend domain + Supabase Site URL
- [ ] (Eventually) Phase 2 scope — structured tables/sub-pages/WYSIWYG, per the CMS plan

**Spec:** [docs/superpowers/specs/2026-06-18-page-content-cms-design.md](docs/superpowers/specs/2026-06-18-page-content-cms-design.md)
**Plan:** [docs/superpowers/plans/2026-06-18-page-content-cms.md](docs/superpowers/plans/2026-06-18-page-content-cms.md)
