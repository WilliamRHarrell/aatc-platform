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
- [ ] **Cloudflare proxy layer.** DNS moved from eNom to Cloudflare and the
      WordPress records are proxied (orange cloud). At cutover each record must
      be repointed to Vercel and its proxy state decided.
      - **SSL mode must be Full or Full (Strict), never Flexible.** Flexible
        terminates TLS at Cloudflare and talks HTTP to the origin; Vercel
        redirects HTTP to HTTPS, so Flexible produces an infinite redirect loop.
        This is the most common Cloudflare + Vercel failure and it presents as
        the entire site being down.
      - Prefer **DNS-only (grey cloud)** for the Vercel records. Vercel's edge
        already provides CDN and TLS; proxying adds a second cache to reason
        about and can mask Vercel's headers.
      - If the proxy stays on, disable **Auto Minify** and **Rocket Loader** for
        the app hostnames — both rewrite JS and can break hydration.
      - Verify: `curl -sI https://allamericantattooconvention.com` returns a
        Vercel `x-vercel-id` header and a single 200, not a redirect chain.
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
- [ ] **Then arm the sweep IN STAGES.** Two flags, not one. Absent = off for
      both, which is the current and correct state.

      **The booth release is irreversible** — there is no assignment history
      table — so the first live run must not be the first real test.

      **Stage 1 — reminders only.** Set `LIFECYCLE_SWEEP_ENABLED=true` and leave
      `LIFECYCLE_SWEEP_DESTRUCTIVE` unset. The sweep runs, sends deposit and
      final reminders, and reports `would_expire` / `would_cancel` counts for
      what a full run WOULD have acted on — without acting. Response includes
      `mode: "reminders-only"`.

      **Run a full cycle in this mode before going further.** Confirm, from the
      logs and from the recipients:
      - the right people were warned, at the right offsets (deposit at 7 days;
        final at 30/14/7/1)
      - nobody was warned who should not have been
      - `would_expire` and `would_cancel` name applications you agree should be
        expired — check each one by hand the first time
      - the reminders actually arrived, not merely returned 200

      **Stage 2 — full.** Only then set `LIFECYCLE_SWEEP_DESTRUCTIVE=true`.
      Response switches to `mode: "full"` and `expired` / `canceled` become
      real. Watch the first full run's output the same day it runs.

      **PRECONDITIONS — both required, independently:**
      1. Nine email templates confirmed as inbox arrivals — **MET 2026-08-13**.
      2. Externally-collected Stripe deposits reconciled — **STILL OPEN**.

      Do NOT set either flag before (2). The sweep targets "approved application
      with no `deposit_paid_at`", which is exactly an exhibitor who paid outside
      the platform — so arming it now would expire the people who have already
      paid you and release their booths.

      Reverting is one variable — unset `LIFECYCLE_SWEEP_DESTRUCTIVE` to fall
      back to reminders-only, or `LIFECYCLE_SWEEP_ENABLED` to stop entirely. But
      reverting does not un-release a booth, which is the whole point of
      staging.
- [ ] Verify the Stripe **production** webhook endpoint and that
      `STRIPE_WEBHOOK_SECRET` matches. No payment has ever been recorded through
      the webhook, so it is unproven end to end.
- [x] **Sending domain verified 2026-07-30.** `send.allamericantattooconvention.com`
      — DKIM, SPF and MX green on an AATC-owned Resend account. First real
      delivery confirmed: inbox not spam, from
      `noreply@send.allamericantattooconvention.com`. No longer a blocker.
- [x] **EMAIL GATE SATISFIED — 2026-08-13.** All nine templates confirmed as
      **inbox arrivals in `accounting@allamericantattooconvention.com`**, not API
      acceptances. The ninth, `deposit_reminder`, arrived at 8:18 PM once
      migration 043 lifted the trigger clamp that was nulling `deposit_due_at`.
      approved · rejected · waitlisted · deposit_reminder · final_reminder ·
      expiration · cancellation · returner_invite · sponsor_approved

      **Do not re-litigate this.** Re-run
      `node scripts/verify-email-templates.mjs --to <addr> --base <url>` only if
      the sending domain, the Resend key, or `/api/send-email` changes.

      **This does NOT mean the sweep can be armed.** It was one of two
      independent preconditions. See the reconciliation item below, which is
      still open and is the one that would cost real exhibitors their booths.

- [x] **`PAYMENT_ALERT_EMAIL` set** to `accounting@allamericantattooconvention.com`
      across all Vercel environments, delivery confirmed to inbox not spam.
      There is deliberately **no fallback**: with none set the webhook refuses to
      alert and logs loudly, because an alert quietly delivered somewhere nobody
      reads is worse than one that fails visibly.
- [ ] Cosmetic: Gmail shows "via americantattoosociety.com" on AATC mail,
      because the Workspace primary is ATS and AATC is a domain alias. Auth and
      delivery are unaffected. Likely a receiving-side artifact of the alias —
      test by sending to an address outside the Workspace before treating it as
      a real problem.
- [ ] **Tattoo Goo: awaiting their response to a Gold offer at the grandfathered
      $3,000.** Not a confirmed sponsor. Set to `status='pending'` by
      [tattoo_goo_offer.sql](../supabase/seeds/tattoo_goo_offer.sql); the accept
      path (lock amount → re-point → confirm) is held in the same file.
      Release the slot if unanswered.

### GRANDFATHERED PRICES — do not "correct" these

Two records sit below current packet pricing **on purpose**. They are historical
commitments honoured at the price agreed, not data errors. Anyone auditing
sponsorship revenue against the July 2026 packet will find them and should leave
them alone.

| Record | Held at | Current packet | Status |
|---|---|---|---|
| Tattoo Goo sponsorship `32ef207d` + invoice `d5f1c5f3` | **$3,000** | Gold $5,000 | **OPEN OFFER, not accepted.** Row corrected to `status='pending'`. `amount_locked` is NOT set — set it only if they accept. |
| VIP Bag sponsorship (any sold pre-July) | **$800** | $1,500 | None exist today; predicate documented in migration 036 |

The July packet raised every main tier (Title $20k→$25k, Platinum $8k→$10k,
Gold $3k→$5k, Silver $1k→$2.5k, Brass $500→$1k). Individual items were
unchanged. Any sponsorship invoiced before 13 July 2026 is grandfathered.

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
- **Role split is NAVIGATION-LEVEL ONLY — accepted risk, part 2 is the remedy.**
  Migration 039 plus per-path gating gives `content_editor` and
  `sponsorship_manager` roles, and `/admin/users` assigns them. But **every RLS
  policy still says `is_admin()`**, so the restriction is the admin interface,
  not the database.

  **A content_editor who knows the API can still read artist government photo
  ID uploads** (`applications.id_doc_url`, `veteran_id_url`, `artists[].id_url`)
  — the most sensitive data in the system — along with sponsor contact details
  and invoice amounts. The sidebar hides those pages; the API does not.

  Accepted deliberately for two trusted colleagues. It stops mistakes and
  reduces incidental exposure; it is **not** a boundary against someone who goes
  looking, and it must not be used for an external contractor or a temporary
  hire.

  **Part 2 (the remedy):** column-level protection. RLS cannot express it, so
  the sensitive columns move behind `SECURITY DEFINER` functions or into a side
  table with its own policy, and the admin policies become `has_role(...)`
  rather than `is_admin()`. Roughly a day. Do it before inviting anyone outside
  the core team.
- **22 public pages are still client-rendered**, including `/directory` and
  `/directory/[id]`. The copy doc requires artist profiles to be server-rendered
  with per-artist meta and `Person` schema.
- **Flag background is a PNG**, not WebP/AVIF.
- **Sponsor tier prices are current** as of the 13 July 2026 packet, held in
  [sponsor-tiers.ts](../src/lib/sponsor-tiers.ts) as the single source. Update
  there only — the display strings on `/sponsors/packages` are derived.
- **Lighthouse and WCAG AA contrast unverified** (gold on the flag texture).

## E2. Accepted tradeoffs and logged gaps

### CMS values are unvalidated prose — accepted

Ticket prices ($70/$72 VIP, $60 weekend, $25 single-day), the $5 military
discount and the March 15 2027 application deadline live **only** as
`page_content` defaults in [registry.ts](../src/content/registry.ts). That is
deliberate — you change them in `/admin/content` with no redeploy, which is the
right tradeoff for values that move.

The cost: they are free text with nothing validating them. A typo in the editor
publishes a wrong ticket price or deadline and nothing catches it. Unlike the
booth and sponsor prices, there is no source of truth to reconcile against.

Two lightweight guards worth adding (neither built):
1. **Editor-side format warning.** The registry already types each section; add a
   `format: 'currency' | 'date'` hint and have `/admin/content` show a
   non-blocking warning when a `price_*` field does not parse as currency or a
   deadline field does not parse as a date. Cheap, catches fat-fingering.
2. **Reconciliation view.** An admin page listing registry values beside their
   `event-config.ts` counterparts where one exists — the March 15 deadline
   against a new `APPLICATION_DEADLINE` constant, for instance. Turns silent
   divergence into something visible, the same way the directory funnel does.

### Schema pattern: a permissive baseline defeats every later tightening

Three separate times, a migration added a stricter policy while an earlier
`using (true)` policy was left in place. PostgreSQL combines permissive policies
with OR, so the stricter one is decorative — it can only ever *add* access.

| Table | Baseline | Tightening it defeated |
|---|---|---|
| `sponsorships` | 001 `public read using (true)` | 019, 025 featured/paid gates |
| `booths` | 001 `public read using (true)` | 024/028 deposit gate — 267 booths anonymously readable while the gate matched none |
| `sponsorships` (again) | 030 `status = 'confirmed'` | no column restriction, so amount/email/phone leaked |

**Rule for any future policy work: start by listing what already exists on the
table, and drop what the new policy replaces — in the same migration.** Adding a
policy is never sufficient on its own. `select * from pg_policies where tablename
= '…'` before writing a line of it.

Migration 038 drops the last of these baselines.

### COMMERCIAL GAP — presentation credits cannot be represented

**Two have already been sold and the system cannot record either of them.** The
Tattoo Battle is presented by Whole Life Aftercare; the Bookkeeping seminar by
Nomadica. Migration 044 gave `schedule_items` and `panels` a
`presented_by_sponsorship_id` FK so the credit is data rather than copy — but
there is nothing valid to point it at.

**Why the FK cannot simply be filled in.** It resolves only against a
sponsorship with `status = 'confirmed'`, and `/sponsors` lists every confirmed
sponsorship for the event with no placement flag consulted (see the section
below). So creating a confirmed sponsorship to make the credit render would
**publicly list them as a full 2027 sponsor**, which overstates what was sold.
And no `sponsor_tier` value means "presentation credit" — the enum is `title`,
`platinum`, `gold`, `silver`, `brass`, `collectible_coin`, `vip_bag`. Picking
the nearest tier misstates the amount and the package.

**Current state, and it is a deliberate holding position, not a bug:** both
credits render as plain text from `presented_by_fallback`. The pages are
correct and shipped. `supabase/verify/verify_044.sql` query F lists every
credit still carried this way — it is the reconciliation report, and it should
reach zero once this is decided.

**What is actually lost while it stays text:** the credit cannot be reported on,
cannot be reconciled against what was invoiced, and disappears the moment
someone edits the seed. A sellable asset with no record of who bought it.

#### DECIDED — Option B: presentation credits as their own sellable. NOT YET BUILT.

**Decision, 2026-08-13. Do not relitigate.** A credit is attached to an *item*,
not to a sponsor — that is how it is priced and how it is delivered. One sponsor
holding several credits with no way to record which item each belongs to was the
disqualifying flaw in the tier approach, and a `sponsor_tier` enum value can
never be dropped in PostgreSQL, which is the wrong kind of permanent for a
guess.

**Shape when picked up:**

```sql
create table presentation_credits (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  sponsorship_id   uuid references sponsorships(id) on delete set null,
  buyer_name       text not null,   -- survives an unlinked/deleted sponsorship
  schedule_item_id uuid references schedule_items(id) on delete set null,
  panel_id         uuid references panels(id) on delete set null,
  amount           int  not null default 0 check (amount >= 0),  -- cents
  status           text not null default 'pending'
                     check (status in ('pending','confirmed','cancelled')),
  invoice_id       uuid references invoices(id) on delete set null,
  created_at       timestamptz not null default now()
);
```

`presented_by_sponsorship_id` on `schedule_items` and `panels` is then replaced
by a read through this table, and `presented_by_fallback` is retired. Note
`buyer_name` is denormalised on purpose, the same reasoning as the booth history
table: the credit must stay reportable if the sponsorship row is unlinked.

Roughly **1.5–2 days**, including an admin surface and invoicing. **Sequenced
after `/admin/schedule` CRUD and portal profile self-edit** — see HANDOFF §5.

#### THE COUNTER — 2 sold, 0 recordable, and it will grow

| Credit | Item | Recorded as |
|---|---|---|
| Whole Life Aftercare | All American Tattoo Battle (Fri 1:00 PM) | plain text |
| Nomadica | Bookkeeping seminar (Sun 1:30 PM) | plain text |

**This number goes up every time another one is sold before the table exists,
and each one is revenue with no record of who bought it, at what price, against
which item.** They render correctly on the public pages — nothing is visibly
wrong — which is exactly why this is easy to keep deferring. `verify_044.sql`
query F is the live count; it will stay non-zero until the table lands, so treat
a growing result there as the signal that this has waited long enough.

The interim position is deliberate: the plain-text fallback is honest about what
it is, and it beats fabricating a sponsorship row that would publish these two
on `/sponsors` as full 2027 sponsors and overstate what was sold.

### No announce step — confirming a sponsor publishes them instantly

`status = 'confirmed'` is the **sole** publish gate. The public read policy is
`status = 'confirmed'`, and `/sponsors` queries `event_id + status` and nothing
else — no placement flag is consulted for the directory. So the moment an admin
marks a sponsorship confirmed, that sponsor is publicly listed as a 2027 sponsor
on the next revalidation.

Sponsors frequently want to time an announcement against their own marketing
calendar — a co-ordinated post, a press date, an embargo until their own
campaign launches. Today there is no way to record "signed but not yet
announced", and no way to sign someone in advance of a date they have asked for.

Scope when picked up: a `publish_at timestamptz` (or an `announced boolean`) on
`sponsorships`, with the public policy becoming
`status = 'confirmed' and (publish_at is null or publish_at <= now())`. Note
that a `publish_at` in the future needs the page cache to revalidate for the
sponsor to appear on time — the 60s window covers that, but it is worth
verifying rather than assuming. Admin gets a date field and a "scheduled"
badge alongside the existing hold badge.

Post-launch. Worth doing before the first big-name signing rather than after.

### Contest results — schema landed, public build scheduled early 2027

No 2026 winners exist (the March test contests were removed in the teardown), so
this is a 2027 feature producing nothing visible for eight months. It sits
behind the role split, floor plan and Wall of Honor, all of which have pre-show
deadlines.

**Landed now (migration 040):** `contest_entries.placement`,
`placement_note`, `placed_at`, `photo_urls[]`, and a partial index. So
`/admin/contests` is ready the moment the 2027 categories are entered, and the
public build has nothing to wait on.

**Deliberately not landed:** the public view, the homepage highlight section and
`/results/[year]`. Roughly 2.5–3 days when picked up.

**Design decisions recorded so they are not relitigated:**
- **The tattoo is the primary photo**, not a presentation shot of the winner —
  people come for the work. Cards are built around close-crop tattoo photography
  with varied aspect ratios, which means a masonry or intrinsic-height grid
  rather than fixed tiles.
- **The artist name is prominent**, not a caption. The results page doubles as a
  recruiting tool for the following year's booths, so the artist is a headline
  element and should link to their directory profile once those exist.
- `photo_url` is the cover shot; `photo_urls[]` holds additional angles. Not a
  rename — voting reads `photo_url` and runs live at the show.
- Year derives from `contests.event_id -> events`. No year column, so 2028 needs
  no migration.

### Panel `max_capacity` is stored but NEVER ENFORCED

`/api/panel-register` inserts a registration without ever counting existing ones
against `panels.max_capacity`. The column is stored, shown in the `/admin/panels`
list as "N / M max", and typed on the public page — but nothing stops the N+1th
signup. The admin list will read "45 / 30 max" without complaint.

So `signup_type = 'free_registration'` buys a **roster, not a cap**. You will
know you are oversubscribed; the form will not prevent it.

This matters now that the two 2027 seminars exist. If either has genuinely
limited seating, the current behaviour is: people register, everyone is
accepted, and the overflow discovers it at the door.

**Fix when picked up** (~2 hours): count `panel_registrations` for the panel
inside the `free_registration` branch and reject with a "this session is full"
response once `max_capacity` is reached. Two caveats — it needs to be a
count-and-insert that tolerates a race (two people claiming the last seat
simultaneously), so do it in a `SECURITY DEFINER` function or accept a small
overshoot; and `aatc_invoice` panels need the same check or a paid registration
can be taken for a full room, which is a refund rather than an apology.

Not blocking launch — no panel has real registrations yet.

### Helper pass — revenue not captured (post-launch, not blocking)

The load-in packet sells a **$25 helper wristband** at the registration desk for
working assistants. Nothing in the platform sells, prices or tracks it — it does
not exist in the schema, the forms, or `pricing.ts`. Every one sold is an
unrecorded cash transaction with no reconciliation against attendance.

Scope when picked up: a `helper_passes` count on `applications` (or a small
`helper_passes` table if they need per-person names for wristband issue), the
price in `pricing.ts`, an add-on line on the application form so exhibitors can
pre-purchase, and a figure on `/admin/print` so the registration desk knows what
each booth has already paid for. Post-launch — the desk can keep taking cash in
the meantime, but the gap should be a decision rather than an oversight.

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
