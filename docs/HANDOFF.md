# AATC Platform — Handoff Document

**Last session:** 2026-05-05 (late evening into 2026-05-06)
**Current state:** All four implementation plans (1–4) shipped and deployed. Platform live at https://aatc-platform.vercel.app. One smoke-test step remaining + two operational follow-ups (Resend domain + Supabase Site URL) before public launch.

---

## TL;DR — pick up here

You're at the **smoke-test stage** of Plan 4. The platform is fully built and deployed. We discovered a real bug during smoke and fixed it (RLS was blocking the send-email route from finding `needs_roster=true` records — patched). Then we hit a Resend domain restriction that means **the platform can't currently send email to anyone except `ryan@ryanharrell.com`**.

You chose Path **(a)** for tonight — finish the smoke test using `ryan@ryanharrell.com` as the recipient, and tackle the proper Resend domain verification later.

The previous test record (`ryan+test@americantattoosociety.com`) was already **cleaned up** (DB rows + auth user deleted via service role).

### Resume in 3 steps

1. Open https://aatc-platform.vercel.app/admin/import-returning (sign in as admin if not already — `ryan@americantattoosociety.com` or `malia@allamericantattooconvention.com`)
2. Submit the form with:
   - **Email:** `ryan@ryanharrell.com` (the address registered with Resend)
   - **Full name:** Test Returner
   - **Type:** Artist
   - **Artist Single qty:** 1
   - **Artist count:** 1
   - **Total paid:** `700.00`
   - Notes: smoke test
3. Check the `ryan@ryanharrell.com` inbox (incl spam) for "Welcome back to AATC 2027" — should arrive within ~1 minute

⚠️ **Heads-up:** the password-reset link in the email may still point to `localhost:3000` because Supabase Site URL hasn't been updated. If it does, manually rewrite the address bar URL: replace `http://localhost:3000` with `https://aatc-platform.vercel.app`, keep the rest of the path + hash intact, hit Enter. Lands you on the reset-password page; set a password; lands on `/portal`.

---

## Verifying the rest of the flow

After getting the email and setting a password:

1. `/portal` should show a **"Complete your roster"** panel (because the imported account has `needs_roster=true`)
2. Upload any image as the booth-holder ID, fill in 1 artist's name, upload another image as their ID, submit
3. `/directory` (in incognito so you're an anon user) should now show "Test Returner" — that's the visibility opening once `needs_roster` flipped false

If any step fails, paste the error and a fresh agent can patch it.

---

## Cleanup the test record after smoke

Run in Supabase SQL Editor:

```sql
-- Find the user_id first
select user_id from applications where email = 'ryan@ryanharrell.com' order by created_at desc limit 1;

-- Then delete in this order
delete from exhibitors where application_id in (select id from applications where email = 'ryan@ryanharrell.com');
delete from invoices where application_id in (select id from applications where email = 'ryan@ryanharrell.com');
delete from applications where email = 'ryan@ryanharrell.com';
```

Then in Supabase Dashboard → Authentication → Users → search `ryan@ryanharrell.com` → delete.

---

## Known issues / required follow-ups before public launch

These are **not** day-to-day work. They're operational items that block public launch.

### 1. Resend domain verification — REQUIRED before launch

**Problem:** Resend default sender (`onboarding@resend.dev`) only delivers to the email that registered the Resend account (`ryan@ryanharrell.com`). Every applicant email — welcome, deposit reminders, expirations, cancellations — silently fails for any other recipient.

**Fix:** Verify a domain at https://resend.com/domains.
- Recommended: a subdomain like `mail.americantattoosociety.com` (doesn't affect normal mail at the apex domain)
- Add the SPF + DKIM DNS records Resend gives you (~3 records, copy/paste into your DNS host)
- Wait for verification (usually <5 min after DNS propagates)
- Update Vercel env: `vercel env rm RESEND_FROM_EMAIL production && vercel env add RESEND_FROM_EMAIL production` (paste e.g. `AATC 2027 <noreply@americantattoosociety.com>`)
- Redeploy: `vercel --prod --yes`

### 2. Supabase Site URL — REQUIRED before public launch

**Problem:** Authentication → URL Configuration → Site URL is still `http://localhost:3000`. Recovery emails (password resets, magic links, the welcome email's "Set Password" link) redirect to localhost.

**Fix:** Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** `https://aatc-platform.vercel.app`
- **Redirect URLs allow-list:** add `https://aatc-platform.vercel.app/**` (keep `http://localhost:3000/**` if you want to keep doing local dev)

### 3. Sponsor RLS baseline policy — non-blocking but should fix

**Problem:** Migration 001 created a permissive `sponsorships: public read using (true)` policy that lets anyone read every sponsorship row. Migration 025 added a stricter policy but RLS uses OR — the baseline still allows everything. Application-level queries in `SiteFooter.tsx` and `sponsors/page.tsx` explicitly filter for `final_paid_at IS NOT NULL`, so the user-visible behavior is correct, but the DB-level gate is weaker than the spec calls for.

**Fix (migration 026):**
```sql
drop policy if exists "sponsorships: public read" on sponsorships;
drop policy if exists "Public can read paid featured sponsors" on sponsorships;

create policy "Public can read paid confirmed sponsors"
  on sponsorships for select
  to anon, authenticated
  using (
    status = 'confirmed'
    and exists (
      select 1 from invoices i
       where i.sponsorship_id = sponsorships.id
         and i.final_paid_at is not null
    )
  );
```

### 4. Lint cleanup — non-blocking

17 pre-existing eslint errors (React 19 strict-mode rules, unescaped quotes, conditional `useEffect` in `SiteFooter`). They don't block the build (Vercel uses `next build`, not `next lint`). Worth a sweep when convenient.

---

## What's done (Plans 1–4 summary)

| Plan | Scope | Date | State |
|---|---|---|---|
| 1 | Vercel deployment, env, Stripe webhook, admin auth | 2026-05-03 | ✅ live |
| 2 | 2027 pivot, multi-booth schema, new pricing, add-ons, copy | 2026-05-04 | ✅ live |
| 3 | Deposit/balance lifecycle, partial payments, milestones, visibility RLS, lifecycle cron | 2026-05-05 | ✅ live |
| 4 | Returner pre-load (`/admin/import-returning`), roster-completion panel, sponsor visibility filters, change-password link, admin reset-password | 2026-05-05 | ✅ live (smoke pending) |

**Spec:** [docs/superpowers/specs/2026-05-02-aatc-2027-pivot-design.md](docs/superpowers/specs/2026-05-02-aatc-2027-pivot-design.md)
**Plans:** [docs/superpowers/plans/](docs/superpowers/plans/)
**Runbook:** [docs/deployment.md](docs/deployment.md) — production URLs, env var inventory, Stripe/Resend/Supabase config, rollback procedure, admin user list, lifecycle cron details

---

## Useful production references

- **Production URL:** https://aatc-platform.vercel.app
- **Vercel project:** `creative-champion/aatc-platform` (linked locally at `.vercel/project.json`)
- **Supabase project ref:** `srlgjovefsmtkxthtjkz` (URL: `https://supabase.com/dashboard/project/srlgjovefsmtkxthtjkz`)
- **Stripe webhook:** `https://aatc-platform.vercel.app/api/webhooks/stripe` (1 event subscribed: `checkout.session.completed` — assuming you trimmed it; otherwise 7)
- **Lifecycle cron:** `https://aatc-platform.vercel.app/api/cron/lifecycle-sweep` (daily 9 AM UTC / 4 AM ET)
- **Admins:** `ryan@americantattoosociety.com`, `malia@allamericantattooconvention.com`
- **CRON_SECRET** (for manual cron testing): in `.env.local` — `b9b35cf9abb8cccbbe08ad31b95fbe923edbbddce2d3c3156d991eb0a5289924`

### Quick admin recipes (Auth Admin API)

From the project directory:

```bash
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SR_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)

# Find a user
curl -s "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" | python3 -m json.tool

# Set a user's password
curl -s -X PUT "$SUPABASE_URL/auth/v1/admin/users/<USER_ID>" \
  -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"<NEW_PASSWORD>"}'

# Delete a user (e.g., test cleanup)
curl -s -X DELETE "$SUPABASE_URL/auth/v1/admin/users/<USER_ID>" \
  -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY"
```

### Manually trigger lifecycle cron

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://aatc-platform.vercel.app/api/cron/lifecycle-sweep
```

Returns `{"ok":true,"summary":{"expired":n,"canceled":n,"deposit_reminders":n,"final_reminders":n}}`.

---

## Repo state

- Branch: `develop` (in sync with `origin/develop`)
- `main` left as historical pointer; not auto-deployed
- Migrations applied to production: 001 through 025
- Last commit: `c5b00a7 chore(email): return Resend error detail for debugging`

The "return Resend error detail" commit is a debug aid — it surfaces Resend errors via the API response. Worth reverting once the domain is verified, but not urgent (the route requires admin auth, so the detail isn't publicly exposed).

---

## When you resume — short checklist

- [ ] Run the smoke test (3 steps above) using `ryan@ryanharrell.com`
- [ ] Verify the public `/directory` shows the test exhibitor after roster completion
- [ ] Clean up the test record
- [ ] Decide on Resend domain (recommended: `mail.americantattoosociety.com`)
- [ ] Verify domain at resend.com/domains, add DNS records, wait for green
- [ ] Update `RESEND_FROM_EMAIL` env var, redeploy
- [ ] Fix Supabase Site URL → `https://aatc-platform.vercel.app`
- [ ] (Optional) Apply migration 026 to drop the sponsor RLS baseline
- [ ] Announce / open public pre-registration

You're 95% done. Goodnight.
