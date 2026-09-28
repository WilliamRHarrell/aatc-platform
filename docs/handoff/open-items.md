# Open items, deferred work, sponsors not yet entered

_Moved verbatim from docs/HANDOFF.md (develop b5a1d3f) on 2026-09-26._

### OPEN ITEMS (one line each, with the owner)

- **Enable `SPONSOR_REMINDERS_ENABLED=true` in Vercel before 2026-12-01**
  (added 2026-09-26). The first reminders fall due 2026-12-02 (30 days before
  the Nomadica and AATS due date, 2027-01-01); WholeLife's 30-day reminder is
  2027-01-01. A late switch-on still catches up the 30-day reminder until 8
  days before the due date. Check `/api/cron/lifecycle-sweep?dry_run=1` first:
  `sponsor_reminders.would_send` should list the three real sponsors only.
  Owner: Ryan.
- **`sponsor_tier_counts()` counts the RLS-harness sponsorships** (added
  2026-09-26): gold shows 6 taken with 5 real gold sponsors, brass 4 with 3.
  No public effect today - only Title and Collectible Coin have sell limits
  and the harness rows are gold and brass - but if gold or brass ever gets a
  limit, a harness row could mark it Sold. Fix when that happens (or at
  cutover, when the harness is removed): exclude `sponsor_name ilike 'ZZ %'`
  in the function. Owner: unassigned.
- **Re-scope "applications: own read" to authenticated** (added 2026-09-26).
  Live it is still roles {public}, qual `auth.uid() = user_id` (Ryan read it
  from verify_079b block B). Harmless, since anon has no uid, but it is the last
  PUBLIC-scoped policy on applications. Do it in the NEXT migration that
  touches applications policies, and add it to that verify's PUBLIC-scope
  check. Owner: whoever writes that migration.
- **In-person (admin-added) applications have no account** (added
  2026-09-26). `user_id` is NULL by design (015/079b), so the exhibitor has no
  portal view, online pay, roster or graphics page. The "link account" admin
  action is queued in START HERE. Owner: queued.
- **Catalog check for the migrations the 2026-08-31 audit could not see**
  (added 2026-09-26): 015 turned out never applied; see
  [migrations.md](migrations.md). Written:
  `supabase/verify/audit_unconfirmed_migrations.sql`, one read-only SELECT,
  48 checks over 002 003 007 011 024 025 031 034 041 043 049 054, each against
  the FINAL expected state after later migrations; DIFFERS rows sort first.
  It also settles whether "schedule_items: admin all" and "contests: admin
  write" are live (070's header said so; 054 drops both). DONE 2026-09-26:
  Ryan ran it, 48 PASS, 0 DIFFERS; recorded in migrations.md.
- **/admin/invoices "Record payment" has no Square option** (added
  2026-09-26): the dropdown offers stripe_external, cash, check,
  bank_transfer, other; 068 made `square` part of the convention but the UI
  was never updated. Owner: unassigned (small code change).
- **/admin/invoices never loads `deposit_paid_at` / `final_paid_at`**
  (added 2026-09-26): `load()` selects neither, so recordPayment's "fires at
  most once" check always sees them empty and a SECOND recorded payment
  overwrites the first deposit/final timestamps. Money path; fix with the
  Square option. Owner: unassigned.
- **Link the three sponsors to accounts** (added 2026-09-26): none of
  Nomadica, AATS, WholeLife has `user_id` or an email on the row, so the
  portal cannot show them their invoice until each is linked in
  /admin/sponsorships. Owner: Ryan.
- **Rate limiting for public form routes** (NOT BUILT): add Vercel WAF
  rate-limit rules before launch on `POST /api/pinup-entry`,
  `POST /api/panel-register`, `POST /api/aatc/*` if any accept anonymous
  input, and the Supabase Auth endpoints reached from `/auth/signup` and
  `/auth/forgot-password` (Supabase applies its own auth rate limits; confirm
  them in the dashboard). `/apply/artist` and `/apply/vendor` write as a
  signed-in user through PostgREST directly, so the WAF rule would go on the
  Supabase project's REST host, not this app; the practical brake there is
  the applications "own insert" policy plus the signup limit. Owner: Ryan
  (dashboard), unassigned (verify).
- **Sweep**: review `scripts/sweep-dry-run.mjs` output before setting
  LIFECYCLE_SWEEP_ENABLED. Owner: Ryan.
- **Tick "Document verified"** on a veteran test application (neither live
  application claims the discount yet). Owner: Ryan.
- **ID document retention** - decide the windows in the plan above, then build
  it as a sweep branch. Owner: Ryan (decision), unassigned (build).
- **Orphan cleanup** - review the dry-run list, then
  `node scripts/cleanup-application-docs-orphans.mjs --delete --allow-mass-delete`
  (the flag is needed this once: 51 of 53 files are candidates, above the
  script's half-bucket guard). Owner: Ryan.
- **Domain cutover** from `aatc-landing` to this project, and production
  `NEXT_PUBLIC_SITE_URL` = `https://www.allamericantattooconvention.com`.
  Blocks printing the Tattoo Battle QR codes. Owner: Ryan.
- **Pre-existing lint errors on develop** (22 errors in 16 untouched files).
  Separate cleanup branch; not fixed on the feature branches by design. Owner: unassigned.
- **Site-wide Lighthouse accessibility pass**: no `<main>` landmark on most
  pages, shared contrast issues (`#666` text, white on `#8B7355` buttons).
  The battle and after-parties pages score 1.00; `/` 0.94. Owner: unassigned.
- **Tattoo-contests category list to the `contests` table** so per-contest
  sponsors can render on /events/tattoo-contests (the 49 rows already exist;
  `TattooContestsClient.tsx` still uses a constant). Owner: unassigned.
- **Official Veteran Ink logo** to replace the stand-in. Owner: Ryan.
- **Print-preview the QR sheet** (`/admin/tattoo-battle/print`, 4x6 in, 100%)
  before labels are printed. Owner: Ryan.

### CLOSED (kept one line each, with the evidence)

- **Re-run verify_074** (PR #8 fixed its fixture). DONE - Ryan, 2026-09-26.
- **Sponsor + pinup emails** (one real sponsor submission and one pinup
  registration; both receipts and both internal notices at CONTACT_EMAIL).
  DONE - verified live 2026-09-25/26, recorded in
  [sessions/2026-09-26.md](sessions/2026-09-26.md) ("sponsor, pinup and panel
  receipts plus internal notices arrive"); confirmed by Ryan 2026-09-26.

### DEFERRED MINORS (from the two whole-branch reviews; kept on purpose)

Tattoo Battle: entry page h1 now exists (fixed); `aria-label` on the "LFG!!"
paragraph (ARIA prohibits it on a paragraph, Lighthouse passed);
`WINNER_ANNOUNCED` is a typed date beside the crowned schedule row;
`${BATTLE_EDITION}rd` hardcodes the ordinal ("4rd" next year); apostrophe
style inconsistency in HOW_IT_WORKS; `capturePoster` non-finite duration
guard (fixed); verify_069 block D could also call the RPC on a draft
expecting check_violation; SlotEditor form state is seeded once, so after a
concurrency reload inputs show this phone's text until reopened;
BattleCountdown comment says "at module load" but runs per render; the
`tattoo_battle_credit.sql` row earlier in this file predates the spelling seed.

After parties: schedule admin venue picker lists all venues, not only the
active event's; "migration not applied" hints key on 42P01 only (PostgREST
reports PGRST205 for a missing table); A1 changed the registry LABEL as well
as the default; contests admin add-insert is not through guardedWrite
(pre-existing shape) and no requestRevalidate after a sponsor change (60 s
window); verify_070 block F teardown does not assert its deletes hit (Z
covers it visually).

## 3. THE THREE SPONSORS - ENTERED, EXCEPT THE INVOICES

**Ryan enters production data himself. Do not create these rows.**

**Reconciled 2026-09-26** against production, read-only (service-role
SELECTs; control: the same invoices query returns the two RLS-harness
sponsorship invoices, so an empty result means absent, not filtered):

| | Nomadica | All American Tattoo Supply | WholeLife Aftercare |
|---|---|---|---|
| `sponsorships` row | confirmed, gold, **$7,500**, is_custom, show_on_sponsors | confirmed, gold, **$5,000**, show_on_sponsors | confirmed, gold, **$5,000**, is_custom, show_on_sponsors |
| `invoices` row | **NONE** | **NONE** | **NONE** |
| `exclusivity_grants` | accounting_presentation | on_site_supplier | tattoo_battle |
| `presentation_credits` | confirmed, $7,500, based_on_tier GOLD | - | confirmed, $5,000, based_on_tier Gold |

All rows created 2026-09-01. show_on_vote_pages, featured_footer and
show_on_homepage are false on all three (set explicitly or defaulted; the
row cannot say which).

**Still open:**
1. **No invoice for any of the three**, so the Square payments ($1,875 /
   $2,500 / $750 below) are recorded nowhere, and no sponsor has a balance the
   portal can collect. Owner: Ryan (step 2 below).
2. **WholeLife amount disagrees with this file**: $5,000 live in both
   `sponsorships.amount` and `presentation_credits.amount`; Ryan confirmed
   2026-09-26 that **$7,500 (Gold, off-tier) is correct**.
3. **Nothing is linked**: every grant and credit above has
   `sponsorship_id` NULL and credits have `invoice_id` NULL; they match on
   `buyer_name` only. Owner: Ryan, when the invoices exist.
4. `based_on_tier` spelling differs ("GOLD" vs "Gold"). Free text; cosmetic.

**Items 1-3 are handled by `supabase/seeds/three_sponsors_2026_09_26.sql`**
(delivered 2026-09-26, NOT RUN): WholeLife to 750000 in both tables, one
invoice each with the Square payment recorded (payment_method `square`),
grants and credits linked by id. The admin UI cannot do it (no Square
option; see OPEN ITEMS). Update this section once it has run.

The original plan, as written 2026-08-31:

| sponsor | invoiced | paid via Square | exclusivity category |
|---|---|---|---|
| Nomadica | $7,500 | $1,875 | `accounting_presentation` |
| All American Tattoo Supply | $5,000 | $2,500 | `on_site_supplier` |
| Whole Life Aftercare | $7,500 | $750 | `tattoo_battle` |

**All three are off-tier** (against Gold $5,000 / Platinum $10,000). Record the
negotiated `amount` and, separately, `based_on_tier` - keeping both means an
off-tier deal loses neither the figure nor the package it came from.

**What each needs:**

1. A `sponsorships` row - name, tier, `amount`, `status = 'confirmed'`, and
   `show_on_sponsors` / `show_on_vote_pages` / `featured_footer` /
   `show_on_homepage` set EXPLICITLY.
2. An `invoices` row for the full amount, with `amount_paid` set to the Square
   figure and `payment_method` recording how it arrived. Migration 033 added
   `payment_method` / `payment_reference` for exactly this; its documented set
   is `stripe_external, cash, check, bank_transfer, other` - **`square` needs
   adding to that convention**, it is free text so no migration is required.
3. An `exclusivity_grants` row - INTERNAL ONLY, never rendered.
4. Whole Life Aftercare additionally has the Tattoo Battle presenting credit,
   already live on three schedule rows and four pages.

**Square to portal does not double-count.** `create-checkout` computes
`balance = amount - amount_paid`, so recording the Square money leaves the
portal offering only the remainder: Nomadica $5,625, AATS $2,500, WLA $6,750.

**What publishing does:** a `sponsorships` row with `status = 'confirmed'` and
`show_on_sponsors = true` appears on `/sponsors`. Nothing else about it is
public - `sponsors_public` exposes a fixed column list, and exclusivity lives in
its own table with no anon grant at all.

**EXCLUSIVITY IS NEVER PUBLIC.** The word "exclusive" appears nowhere on the
site in connection with any sponsor - verified in RENDERED output, not just
source. The four occurrences that do exist are an Artist Lounge tier perk and
VIP poster copy, unrelated.

## 4. DEFERRED, WITH TRIGGERS

| item | blocked on / revisit when |
|---|---|
| **payments ledger** | Revisit BEFORE on-site pre-registration. 2027 is Stripe-dominant; Ryan takes ~20-25% of next year's bookings as cash/card at a table during the show. Estimate 1-1.5 days. See the entry below on why a mis-recorded manual payment is undetectable. |
| **In Memoriam photos** | Blocked on the WordPress media harvest, CUTOVER section A. Building against URLs that die is wasted work, and it is where "no placeholder humans" matters most. |
| **After-party venues** | **Venues and times DONE** (read live 2026-09-26): three `venues` rows (Uptown's Chicken & Waffles, Group Therapy Pub & Playground, Club Luna) and three published After Party rows - Thu 2027-04-15 18:00 Uptown's, Fri 04-16 20:00 Group Therapy, Sat 04-17 20:00 Club Luna. **Still open:** Sunday Brunch (04-18, Uptown's) is unpublished with no start time; act and door price are not columns on `schedule_items`, so if they are to appear they need a home first. Owner: Ryan. |
| **`/admin/schedule` for content_editor** | Granted 2026-08-31. Done. |
