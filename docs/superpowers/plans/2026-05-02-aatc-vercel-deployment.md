# AATC Platform — Vercel Production Deployment (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the existing AATC platform reachable on a public Vercel URL with all production env vars wired (Supabase, Stripe live, Resend, webhooks). No 2027 work in this plan — that comes in Plans 2–4.

**Architecture:** Next.js 16 App Router app deploying to Vercel, env-driven config, GitHub-integrated auto-deploys. Memory indicates a Vercel project already exists for this repo; local CLI is not linked. Plan links it, syncs env vars, configures the Stripe production webhook, verifies Resend domain, and runs a public smoke test. If the Vercel project does not exist yet, an alternate path creates one.

**Tech Stack:** Next.js 16.1.6, Vercel, Supabase, Stripe (live keys), Resend, GitHub.

**Pre-flight assumptions verified before writing plan:**
- Vercel CLI installed at `/opt/homebrew/bin/vercel`
- No local `.vercel/` directory (project not linked locally)
- `.gitignore` already excludes `.vercel`
- 9 env vars present in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`
- Last commit on `develop`: `7db8f75 Trigger redeploy`
- 19 migrations present in `supabase/migrations/`
- Working tree is clean

**Risk callouts:**
- Stripe live keys mean any successful checkout in production charges a real card. Recommend Stripe **test-mode** keys during the Plan 1 smoke test, then swap to live before public announcement (Plan 2 or 3).
- The webhook signing secret in `.env.local` is from local Stripe CLI listening, not the production webhook. It MUST be replaced with the Vercel webhook's signing secret before production checkouts will validate.

---

### Task 1: Pre-flight — confirm clean local build

**Files:** none modified.

- [ ] **Step 1: Verify clean working tree**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
git status
```

Expected: `On branch develop` and `nothing to commit, working tree clean`. If dirty, stop and decide what to do with the changes before deploying.

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: completes without errors. Warnings about peer dependencies are OK.

- [ ] **Step 3: Run a local production build**

```bash
npm run build
```

Expected: build completes with `✓ Compiled successfully` and a route table. If the build fails, stop and fix the failure — there is no point deploying a broken build. Common failure modes: missing env vars at build time (`SUPABASE_URL` etc. — but these are server-side and shouldn't break build), TypeScript errors, Suspense boundary errors.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no errors. Warnings are OK.

No commit at end of this task — nothing changed.

---

### Task 2: Audit Vercel CLI authentication and existing project

**Files:** none modified.

- [ ] **Step 1: Verify Vercel CLI auth**

```bash
vercel whoami
```

Expected: prints the username/team you're logged into Vercel as. If it says "Not authenticated", run `vercel login` and complete the browser-based auth flow, then re-run `whoami`.

- [ ] **Step 2: List Vercel projects to find the existing one**

```bash
vercel projects ls
```

Expected: a table of projects. Look for one named `aatc-platform` or similar (the repo name from GitHub: `WilliamRHarrell/aatc-platform`). Note the exact project name and team/scope.

- [ ] **Step 3: Inspect the project's recent deployments**

```bash
vercel ls aatc-platform
```

(Substitute the actual project name found in Step 2. If it doesn't exist, skip ahead to Task 3 alternate path.)

Expected: a list of deployments with URLs, statuses, ages. Note:
- Whether the most recent prod deploy is `READY` or `ERROR`
- The current production URL (e.g. `aatc-platform.vercel.app` or `aatc-platform-<team>.vercel.app`)
- Which Git branch produced the last deploy (memory says deploys are likely from `develop` or `main`)

Document findings:

```text
Project name: <name>
Team/scope: <scope>
Production URL: <url>
Production branch: <branch>
Last prod deploy: <READY|ERROR|BUILDING>
```

If the project does NOT exist, note that and proceed to Task 3 alternate path.

No commit.

---

### Task 3: Link local repository to the Vercel project

**Files:**
- Create: `.vercel/project.json` (auto-created by `vercel link`, gitignored)

- [ ] **Step 1: Run `vercel link`**

```bash
cd /Users/ryanharrell/Documents/aatc-platform
vercel link
```

Interactive prompts:
- "Set up `~/Documents/aatc-platform`?" → Yes
- "Which scope?" → choose the team identified in Task 2
- "Link to existing project?" → Yes (if project exists from Task 2) / No (if creating fresh)
- "What's the name of your existing project?" → enter the project name from Task 2

If creating a new project (alternate path because none exists):
- "Link to existing project?" → No
- "What's your project's name?" → `aatc-platform`
- "In which directory is your code located?" → `./`
- Vercel auto-detects Next.js, accepts defaults.

- [ ] **Step 2: Verify the link**

```bash
cat .vercel/project.json
```

Expected: a JSON file with `projectId` and `orgId` fields.

- [ ] **Step 3: Verify `.vercel/` is gitignored**

```bash
git status --ignored | grep .vercel
```

Expected: `.vercel/` shown as ignored. (If somehow not ignored, do not commit it — it contains the project ID which should not be public if the repo ever goes public.)

No commit (only ignored files changed).

---

### Task 4: Inventory current Vercel production env vars

**Files:** none modified.

- [ ] **Step 1: List production env vars on Vercel**

```bash
vercel env ls production
```

Expected: a table of env var names currently set for production. Capture the list exactly.

- [ ] **Step 2: Compare against local `.env.local`**

```bash
diff <(grep -E '^[A-Z_]+=' .env.local | sed 's/=.*//' | sort) <(vercel env ls production 2>/dev/null | awk 'NR>2 {print $1}' | grep -E '^[A-Z_]+$' | sort)
```

(Note: `vercel env ls` output formatting may vary by CLI version — if the awk fails, just visually compare the two lists.)

Expected: identifies which of these 9 keys are missing from Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_SITE_URL
```

Document the gap (which keys are missing or stale).

No commit.

---

### Task 5: Push missing env vars to Vercel production

**Files:** none modified.

- [ ] **Step 1: For each missing env var from Task 4, add it to production**

Repeat for each missing key. Do NOT push `STRIPE_WEBHOOK_SECRET` or `NEXT_PUBLIC_SITE_URL` yet — those are handled in Tasks 7 and 9 respectively, after we know the production URL and have created the production webhook.

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
```

Vercel CLI will prompt for the value. Paste it from `.env.local`. Repeat for each key.

For convenience, you can also run:

```bash
# WARNING: this prints the value to your terminal — close other apps that might OCR the screen
grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local
```

…then copy/paste into the Vercel prompt.

- [ ] **Step 2: Skip these (handled later):**
  - `STRIPE_WEBHOOK_SECRET` — Task 8 (after creating production webhook)
  - `NEXT_PUBLIC_SITE_URL` — Task 7 (after first deploy gives us a URL)

- [ ] **Step 3: Verify all expected vars are now present**

```bash
vercel env ls production
```

Expected: 7 vars present (all except `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_SITE_URL`).

No commit.

---

### Task 6: Verify production Supabase migrations are current

**Files:** none modified.

- [ ] **Step 1: Open Supabase dashboard SQL editor for the production project**

The Supabase project URL is the value of `NEXT_PUBLIC_SUPABASE_URL` (project ref is the subdomain prefix). Sign in at `https://supabase.com/dashboard`.

- [ ] **Step 2: List applied migrations in production**

In SQL editor, run:

```sql
select * from supabase_migrations.schema_migrations order by version;
```

Expected: 19 rows for migrations `001` through `019_sponsor_featured_footer`.

- [ ] **Step 3: If any are missing, apply them in order**

For each missing migration, copy the SQL from `supabase/migrations/<filename>.sql` and run it in the SQL editor. Apply in numeric order. Do NOT skip.

- [ ] **Step 4: Sanity check — booth count**

```sql
select count(*) from booths;
```

Expected: 267 (from migration 005). If 0, run `005_seed_booths.sql` manually.

No commit.

---

### Task 7: Trigger first production deploy and capture the production URL

**Files:**
- Modify: `.env.local` only if `NEXT_PUBLIC_SITE_URL` needs to change locally too.

- [ ] **Step 1: Identify the production branch**

Open the Vercel dashboard for the project → Settings → Git → "Production Branch." Note the value (likely `main` or `develop`).

Memory says active work is on `develop` and `main` is stable — typically Vercel deploys `main` to production and treats `develop` pushes as preview. Confirm in the dashboard.

- [ ] **Step 2: Trigger a deploy**

Two options — use whichever matches the Vercel project's deploy config:

**(a) If Vercel auto-deploys from a Git branch:**

```bash
git push origin develop
```

(or the production branch if different). Vercel will build and deploy automatically.

**(b) If Vercel is set up for CLI deploys only:**

```bash
vercel --prod
```

- [ ] **Step 3: Watch the deploy**

```bash
vercel ls aatc-platform | head -5
```

Refresh until the most recent deploy shows `READY`. Or watch in the Vercel dashboard.

- [ ] **Step 4: Capture the production URL**

```bash
vercel ls aatc-platform --prod | head -3
```

Expected: a URL like `aatc-platform.vercel.app` or `aatc-platform-<team>.vercel.app`. Copy this exactly.

- [ ] **Step 5: Set `NEXT_PUBLIC_SITE_URL` to the production URL**

```bash
vercel env add NEXT_PUBLIC_SITE_URL production
```

When prompted, enter `https://<production-url>` (no trailing slash). For example: `https://aatc-platform.vercel.app`.

- [ ] **Step 6: Redeploy to pick up the new env var**

```bash
vercel --prod --force
```

(or push a no-op commit if using Git-triggered deploys)

- [ ] **Step 7: Verify the site loads**

Open the production URL in a browser. Expected: the AATC homepage renders. Any 500 errors mean missing env vars or build issues — check the Vercel deploy logs.

No commit (no local file changes).

---

### Task 8: Configure production Stripe webhook

**Files:** none modified locally. Configuration happens in the Stripe dashboard.

- [ ] **Step 1: Open Stripe dashboard → Developers → Webhooks**

Sign in at `https://dashboard.stripe.com`. Make sure you're in **Live mode** (not Test mode) since `.env.local` has live keys.

- [ ] **Step 2: Create new endpoint**

Click "Add endpoint."
- Endpoint URL: `https://<production-url>/api/webhooks/stripe`
- Description: `AATC platform — checkout session completed`
- Events to send: search for and select **`checkout.session.completed`** (only that one for now)
- Click "Add endpoint."

- [ ] **Step 3: Copy the signing secret**

On the new endpoint's detail page, click "Reveal" next to "Signing secret." Copy the value (starts with `whsec_`).

- [ ] **Step 4: Add to Vercel production env**

```bash
vercel env add STRIPE_WEBHOOK_SECRET production
```

Paste the `whsec_...` value when prompted.

- [ ] **Step 5: Redeploy**

```bash
vercel --prod --force
```

(or push a no-op commit if using Git-triggered deploys)

- [ ] **Step 6: Verify the endpoint is reachable**

In the Stripe webhook detail page, click "Send test webhook." Send a test `checkout.session.completed` event. Stripe will show whether the endpoint returned 200. If not, check the Vercel function logs:

```bash
vercel logs aatc-platform --prod
```

Look for the `/api/webhooks/stripe` invocation and any error.

No commit.

---

### Task 9: Verify Resend from-domain

**Files:**
- Possibly modify: Vercel env var `RESEND_FROM_EMAIL` if the from-domain changes.

- [ ] **Step 1: Inspect current value**

```bash
grep '^RESEND_FROM_EMAIL=' .env.local
```

If the value is `onboarding@resend.dev`, the email sender is Resend's default — this works for testing but Stripe/Resend mark these as low-trust and recipients may see them in spam. For a real launch, swap to a verified domain.

- [ ] **Step 2: Decision point**

- **(a) Keep `onboarding@resend.dev` for now** — Plan 1 ships with the default sender. Move to Task 10. Note: emails will arrive but may go to spam.
- **(b) Verify a custom domain** — proceed to steps 3–6 below.

- [ ] **Step 3 (option b): Add domain in Resend**

Sign in to `https://resend.com/domains`. Click "Add Domain." Enter the domain you want to send from (e.g., `mail.americantattoosociety.com` or just `americantattoosociety.com`). Resend gives you DNS records to add.

- [ ] **Step 4 (option b): Add DNS records**

In your DNS provider (likely the same one hosting `americantattoosociety.com`), add the records Resend lists — typically:
- One TXT for SPF
- One TXT for DKIM
- One MX (optional, for DMARC reporting)

Wait for DNS propagation (5 min to 1 hour).

- [ ] **Step 5 (option b): Verify in Resend dashboard**

Click "Verify DNS" in Resend until all records are green.

- [ ] **Step 6 (option b): Update Vercel env var**

```bash
vercel env rm RESEND_FROM_EMAIL production
vercel env add RESEND_FROM_EMAIL production
```

Enter the new from address: `noreply@<verified-domain>` (or `info@`, `tickets@`, etc — match your branding).

- [ ] **Step 7 (option b): Redeploy**

```bash
vercel --prod --force
```

No commit.

---

### Task 10: Smoke test critical paths on production

Before testing, **strongly consider switching to Stripe TEST keys** in Vercel for the duration of this task to avoid charging real cards. To do that:

```bash
# Save current live keys, then swap to test keys from Stripe dashboard → Developers → API keys (Test mode)
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production  # paste sk_test_...
vercel env rm NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production  # paste pk_test_...
# Also swap STRIPE_WEBHOOK_SECRET to a test-mode webhook (create a separate endpoint in Test mode)
```

Redeploy after the swap. After Plan 1 verifies, swap back to live keys before public launch.

- [ ] **Step 1: Smoke — homepage**

Open `https://<production-url>` in a browser. Expected: homepage renders, navigation works, no console errors (open browser devtools).

- [ ] **Step 2: Smoke — apply page**

Navigate to `/apply`. Expected: countdown to April 19, 2026 (still 2026 since this is the existing build) renders, "Artist", "Vendor", "Sponsor" CTAs work.

- [ ] **Step 3: Smoke — auth signup**

Click "My AATC" / login → "Sign up." Use a test email (e.g., a Gmail with `+test` alias). Confirm:
- Signup form posts successfully
- A confirmation email arrives within 1–2 minutes (check spam)
- The email link returns to `/auth/callback` and lands on `/portal`

- [ ] **Step 4: Smoke — apply form (partial)**

Start an artist application. Fill step 1 contact info, advance to step 2. Expected: form transitions work, validation triggers when fields are empty.

(Don't complete a full application — we just need the form to be reachable and partially functional. Plan 2 will rework these forms anyway.)

- [ ] **Step 5: Smoke — Stripe checkout (test mode)**

If you want to test the full payment flow: log in as a user with an approved application + invoice (you may need to manually approve one in `/admin/applications`, which requires `role='admin'` on your profile — see Task 11). Click "Pay Now." Expected: redirects to Stripe Checkout. Use Stripe test card `4242 4242 4242 4242` with any future date and any CVC. After payment, Stripe redirects back; webhook fires; invoice marked paid.

If anything fails, check `vercel logs aatc-platform --prod` for stack traces.

- [ ] **Step 6: Document smoke results**

In a scratch text file (do not commit), note pass/fail per step. If any step fails, that's a regression to fix before continuing to Plan 2.

No commit yet — collected findings inform Step 11 below.

---

### Task 11: (If needed) Set yourself as admin on production Supabase

**Files:** none modified.

- [ ] **Step 1: In Supabase SQL editor, set admin role**

```sql
update profiles
   set role = 'admin'
 where email = 'ryan@americantattoosociety.com';
```

Expected: `UPDATE 1`. (If 0 rows updated, the profile doesn't exist yet — sign up via the production site first, then re-run.)

- [ ] **Step 2: Verify admin access**

In an incognito browser, log in as `ryan@americantattoosociety.com`. Navigate to `/admin`. Expected: admin dashboard loads.

No commit.

---

### Task 12: Write a deployment runbook

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Write the runbook**

Capture the production-state findings from Tasks 2, 7, 8, 9 in a short reference doc.

```bash
cat > docs/deployment.md <<'EOF'
# AATC Platform — Deployment Runbook

## Production

- **URL:** https://<production-url>
- **Vercel project:** <project-name> (scope: <scope>)
- **Production branch:** <branch>
- **Supabase project:** <project-ref>.supabase.co
- **Stripe mode:** live (or test, if not yet swapped back)
- **Resend from-domain:** <onboarding@resend.dev | verified domain>

## Env vars in Vercel production

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_SECRET_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY
- RESEND_FROM_EMAIL
- NEXT_PUBLIC_SITE_URL

## Stripe webhook

- **Endpoint:** https://<production-url>/api/webhooks/stripe
- **Events:** checkout.session.completed
- **Signing secret:** stored in Vercel env (rotate if leaked)

## Re-deploy

```bash
git push origin <production-branch>
# or
vercel --prod
```

## Rollback

```bash
vercel rollback aatc-platform
```

(Or use the Vercel dashboard's "Promote" on a previous READY deployment.)
EOF
```

(Replace placeholders with the actual values gathered in earlier tasks before saving.)

- [ ] **Step 2: Commit the runbook**

```bash
git add docs/deployment.md
git commit -m "docs: add Vercel deployment runbook

Captures production URL, Vercel project, Supabase project, Stripe webhook,
and re-deploy/rollback procedures from the Plan 1 deployment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push the commit**

```bash
git push origin develop
```

(This will also trigger a redeploy if Vercel watches develop — that's fine, no functional change.)

---

### Task 13: Plan 1 success criteria verification

**Files:** none modified.

- [ ] **Step 1: Walk the success criteria**

Confirm each is true:

- [ ] The production URL is reachable in a browser (no 5xx)
- [ ] Homepage renders without console errors
- [ ] Auth signup works end-to-end (email arrives, callback succeeds)
- [ ] All 9 env vars are set in Vercel production
- [ ] Stripe webhook is registered and reachable (test event returned 200)
- [ ] Supabase production has all 19 migrations applied
- [ ] `docs/deployment.md` is committed
- [ ] (Optional) Resend domain verified

- [ ] **Step 2: If anything fails, file it as a fix-up task**

Either fix in-line if quick, or note in `docs/deployment.md` under a new "Known issues" heading with a follow-up task. Plan 2 (year/event pivot + form updates) does not need to wait on cosmetic issues.

---

## Notes for the executing agent

- This is a configuration-heavy plan, not a code-writing one. There are no unit tests to write because there is no new code. "TDD" maps to "verify state → act → verify state again."
- Do NOT push to `main` unless that's the production branch and the user has explicitly authorized it.
- Do NOT run destructive commands (force-push, env rm without confirmation, project delete) without confirming with the user.
- Sensitive values (env var values, signing secrets) MUST be pasted into prompts, never written to files or committed. The runbook in Task 12 documents var NAMES only.
- If `vercel link` ever links to the wrong project, run `rm -rf .vercel && vercel link` and start over.
- After Plan 1 succeeds, the next plan is `2026-05-02-aatc-2027-pivot.md` (to be written) — year/event pivot, new pricing, multi-booth model, form updates, copy.

## Dependencies on user

The agent CANNOT do these without the user:

- `vercel login` (browser auth)
- Stripe dashboard work in Task 8 (webhook endpoint creation, signing secret)
- Resend dashboard work in Task 9 (domain verification, DNS records)
- DNS provider work in Task 9
- Supabase dashboard auth in Tasks 6 and 11
- Decision in Task 10 about test vs. live Stripe mode

The plan calls these out explicitly so the agent pauses for user action when needed.
