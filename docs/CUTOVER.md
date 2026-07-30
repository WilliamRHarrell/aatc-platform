# DNS Cutover Checklist

**Purpose:** the single authoritative list of everything that must happen to move
`allamericantattooconvention.com` from WordPress to this platform. Chat history
is not a system of record — this file is. Keep it updated as items land.

**Status key:** `[ ]` outstanding · `[x]` done · `[~]` in progress · `[!]` blocked

---

## A. The cutover change window

These are the switches that must flip together. Doing any of them early makes
things worse, not better.

- [ ] **Flip `NEXT_PUBLIC_SITE_URL`** in Vercel to `https://allamericantattooconvention.com`.
      This one variable is the master switch. Everything below keys off it:
      - `robots.txt` changes from `Disallow: /` to allow-all + sitemap
      - the `noindex` meta is removed from every page
      - canonical URLs begin emitting
      Deliberately NOT done early: WordPress does not serve `/directory` or most
      new routes, so canonicals pointing at the real domain would assert URLs
      that 404. See [src/lib/site.ts](../src/lib/site.ts).
- [ ] **Verify** after the flip: `curl https://allamericantattooconvention.com/robots.txt`
      shows allow-all; no `<meta name="robots" content="noindex">` on any page;
      canonical present and pointing at the real host.
- [ ] **Freeze the URL list and build the 301 map** from every indexed WordPress
      URL to its new equivalent. Must be complete BEFORE the flip — this is the
      only thing carrying the existing domain's ranking across.
- [ ] **Wall of Honor media off WordPress.** Tribute photos are served via
      WordPress form-download URLs that die when WordPress is shut off. Every
      image must be downloaded and re-hosted in Supabase Storage first. Family-
      written tribute text should migrate verbatim, typos included.
- [ ] Confirm no remaining asset references a WordPress URL (last checked clean,
      but re-verify at the window).

## B. Remove test and harness data

- [ ] **Delete the harness sponsor and its records.** `f2a007e0` renders on the
      live homepage sponsor grid and (post-hydration) the footer as
      **"ZZ TEST — RLS Harness (DELETE ME)"**. Teardown SQL:
      [supabase/seeds/rls_harness_records.sql](../supabase/seeds/rls_harness_records.sql)
      (the commented block at the bottom). Removing it also removes the
      non-vacuous case from the verify harness — expected, once real sponsors exist.
- [ ] Delete the harness auth user `rls-harness@allamericantattooconvention.com`.
- [ ] Decide on the retained inactive event row `b3630abd…`. It is empty of
      content now and is kept only as a rollback anchor; safe to delete once
      confident, but migration 034's one-active-event index does not require it.
- [x] Test applications, invoices, exhibitors, booth assignments removed.
- [x] Test panels, contests, entries, votes, food trucks, duplicate booths removed.
- [ ] Clear test uploads from Storage. **DELETE:** `application-docs` user
      folders, `exhibitor-media` user folders, all of `contest-photos`,
      `food-truck-logos`, `panel-images`. **KEEP:**
      `exhibitor-media/sponsors/`, `exhibitor-media/aatc-graphics`, `site-assets`.

## C. Payments and reconciliation

- [ ] **Reconcile the externally-collected Stripe deposits** into the platform.
      Use the admin payment modal, recording `payment_method` = "Stripe invoice
      (outside platform)" and the Stripe invoice ID in `payment_reference`.
      Nothing emails the exhibitor and there is no accounting integration, so no
      duplicate receipt and no double-count.
- [ ] **Then enable `LIFECYCLE_SWEEP_ENABLED=true`** in Vercel. Absent = off,
      which is the current and correct state. Do NOT set it before
      reconciliation: the sweep targets "approved application with no
      `deposit_paid_at`", which is exactly an exhibitor who paid outside the
      platform, and it expires them and releases their booth.
- [ ] Verify the Stripe **production** webhook endpoint and that
      `STRIPE_WEBHOOK_SECRET` matches. No payment has ever been recorded through
      the webhook, so it is unproven end to end.
- [ ] Confirm `RESEND_FROM_EMAIL` uses a verified domain (was
      `onboarding@resend.dev`). Until then, email delivery is restricted.
- [ ] Decide Tattoo Goo: paying Gold or trade/in-kind. Variants ready in
      [teardown_test_event_content.sql](../supabase/seeds/teardown_test_event_content.sql).

## D. Content that must be real before launch

- [ ] Ticketmaster links (≈ October 2026) — then set `ticket_sales_live` and
      `ticket_url` in `/admin/content`. No redeploy needed.
- [ ] 2027 schedule of events
- [ ] Founding story for the About page
- [ ] Sponsor sheet: names, tiers, logos, URLs, one-liners
- [ ] Food truck sheet
- [ ] Contest categories, days, prize info
- [ ] YouTube promo video ID → `PROMO_VIDEO.youTubeId` in
      [event-config.ts](../src/lib/event-config.ts). Section renders nothing until set.
- [ ] Best in Show 2026 photos + artist credits + publication permission →
      `BEST_IN_SHOW`. Section renders nothing until set.
- [ ] After-party venues, addresses, times (Thu/Fri/Sat)
- [ ] Purpose-built 1200×630 OG image (currently falls back to the horizontal logo)
- [ ] Remaining FAQ rulings: guardian requirement for under-18s, re-entry
      policy, parking cost, ATM on site, WiFi, 2027 freight address

## E. Known gaps carried into launch

Not blockers, but recorded so they are decisions rather than surprises.

- **PITR is not enabled.** 8 daily snapshots only, so restore granularity is
  daily. Worth revisiting once real applications flow.
- **No booth assignment history.** A booth release is not reversible from inside
  the platform. See "Booth assignment history" scope below.
- **No floor plan geometry.** All 267 booths have `x=0, y=0` and `1×1`
  dimensions; migration 020's seed sets no coordinates.
- **Binary permission model.** `is_admin()` only — anyone invited as an admin
  sees sponsor contact details, invoice amounts and artist ID uploads. Role
  split scoped separately.
- **22 public pages are still client-rendered**, including `/directory` and
  `/directory/[id]`. The copy doc requires artist profiles to be server-rendered
  with per-artist meta and `Person` schema.
- **Flag background is a PNG**, not WebP/AVIF.
- **Sponsor tier prices may be stale.** Code has Gold at $3,000; the July packet
  reportedly raised it to $5,000. [sponsor-tiers.ts](../src/lib/sponsor-tiers.ts)
  is now the single source — update it there, not in three places.
- **Lighthouse and WCAG AA contrast unverified** (gold on the flag texture).

## F. Post-cutover

- [ ] Build the sitemap (environment-aware host, never emits `vercel.app`).
- [ ] Server-render `/directory` and `/directory/[id]` with per-artist meta and
      `Person` schema — do this BEFORE requesting indexing.
- [ ] Then request re-indexing in Search Console. Low priority: the broken
      directory only ever lived on `aatc-platform.vercel.app`, which has no
      equity and no sitemap, so there is likely nothing indexed to repair.
- [ ] Update the Google Business Profile address to match the `<address>`
      element exactly: Crown Complex Event Center, 131 E. Mountain Dr.,
      Fayetteville, NC 28306.

---

## Scope: booth assignment history (append-only)

**Why.** A booth assignment can currently be erased with no record, by three
different paths: the lifecycle sweep, an admin unassign, and an application
delete (`booths.application_id` is `ON DELETE SET NULL`). Migration 035 made the
sweep atomic, which stops a half-finished release — but atomic still means the
prior assignment is gone. With PITR disabled, a mistaken release is only
recoverable from a daily snapshot, and only by rolling back everything else too.

**Shape.**

```sql
create table booth_assignment_history (
  id              uuid primary key default gen_random_uuid(),
  booth_id        uuid not null references booths(id) on delete cascade,
  application_id  uuid,          -- intentionally NO FK: must survive the
                                 -- application being deleted
  event_id        uuid not null references events(id) on delete cascade,
  action          text not null check (action in ('assigned','released')),
  reason          text not null check (reason in
                    ('admin_assign','admin_unassign','sweep_expire',
                     'sweep_cancel','application_deleted','migration')),
  actor_id        uuid,          -- auth.users, null for cron/system
  booth_number    text not null, -- denormalised so history survives booth deletion
  business_name   text,          -- denormalised likewise
  occurred_at     timestamptz not null default now()
);
```

Append-only, enforced: `grant select, insert` to the app roles and no `update`
or `delete` at all; a `BEFORE UPDATE OR DELETE` trigger that raises. The
denormalised `booth_number` and `business_name` are the point — a history row
must remain readable after both parents are gone, which is precisely the case a
FK-only design fails.

**Write points.** A trigger on `booths` covering any `application_id`
transition catches all three paths in one place, including the FK `SET NULL`,
which application-level code cannot intercept. `reason` and `actor_id` come from
session GUCs set by the caller, defaulting to `'migration'`/null.

**Cost.** One migration, one trigger, one admin read view. No application code
changes required for capture. Roughly a half-day including a
`/admin/booths/[id]` history panel.

**Recommended order:** after the capability audit, before real applications
arrive — retrofitting history gives you no record of anything that happened
before it existed.
