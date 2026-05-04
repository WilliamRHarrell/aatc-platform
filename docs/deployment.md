# AATC Platform — Deployment Runbook

## Production

- **URL:** https://aatc-platform.vercel.app
- **Vercel project:** `aatc-platform` (scope: `creative-champion`)
- **Vercel project ID:** `prj_81mDTPBr6hLRY3VhXO50r91K88OZ`
- **Supabase project:** `srlgjovefsmtkxthtjkz.supabase.co`
- **Stripe mode:** live
- **Resend from-domain:** `onboarding@resend.dev` (default — verify a custom domain at domain-cutover time)

## Env vars in Vercel production

All set as of 2026-05-03 deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_SITE_URL` (= https://aatc-platform.vercel.app)

## Stripe webhook

- **Endpoint:** `https://aatc-platform.vercel.app/api/webhooks/stripe`
- **Stripe destination ID:** `we_1T6MpkKHgO9mrNxSUPZ08D9r`
- **Events:** currently listening to 7 events; only `checkout.session.completed` is required for current code paths
- **Signing secret:** stored in Vercel env (rotated 2026-05-03; rotate again if leaked)

## Re-deploy

From the project directory with the local CLI linked:

```bash
cd /Users/ryanharrell/Documents/aatc-platform
vercel --prod --yes
```

Or to force a clean redeploy (e.g., after env-var change):

```bash
vercel --prod --yes --force
```

GitHub-triggered deploys: not currently in use. The Vercel project is linked but auto-deploys are not relied upon for production. CLI deploys are the source of truth.

## Rollback

```bash
vercel rollback aatc-platform
```

Or in the Vercel dashboard: Deployments → find a previous READY deployment → "Promote to Production."

## Supabase migration state (as of 2026-05-03)

All 19 migrations applied (`001` through `019_sponsor_featured_footer`). Verified via:

```sql
select
  exists(select 1 from information_schema.columns where table_name='applications' and column_name='logo_url') as has_009,
  exists(select 1 from information_schema.columns where table_name='invoices' and column_name='amount_paid') as has_010,
  exists(select 1 from information_schema.tables  where table_name='panels') as has_016,
  exists(select 1 from information_schema.tables  where table_name='food_trucks') as has_017,
  exists(select 1 from information_schema.columns where table_name='sponsorships' and column_name='featured_footer') as has_019;
```

Booth count: 267. Event count: 1.

## Auth admin operations (via service-role API)

When email-based recovery is unavailable (rate-limited, mis-configured Site URL, etc.), use the Auth Admin API. From the project directory:

```bash
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)
SR_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)

# Find a user
curl -s "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" \
  | python3 -m json.tool | grep -A1 -B1 '"email"'

# Set a user's password
curl -s -X PUT "$SUPABASE_URL/auth/v1/admin/users/<USER_ID>" \
  -H "apikey: $SR_KEY" -H "Authorization: Bearer $SR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"<NEW_PASSWORD>"}'
```

## Known follow-ups (carried into Plan 2)

- **Supabase Auth → URL Configuration**: Site URL still set to `http://localhost:3000`. Update to `https://aatc-platform.vercel.app` and add `https://aatc-platform.vercel.app/**` to the Redirect URLs allow-list. Until done, all email-based auth flows (magic links, password recovery, signup confirmation) redirect to localhost.
- **Resend custom from-domain**: deferred until domain cutover. Currently sending as `AATC 2027 <onboarding@resend.dev>`.
- **User-facing "Change password" link**: `/auth/reset-password` works for logged-in users but isn't linked from the portal nav or user menu. Add a visible link in Plan 2.
- **Admin "Reset password for user" tool**: `/admin/applications/[id]` should have a button that uses the Auth Admin API to email a recovery link or set a temp password for the linked user. Add in Plan 2 or Plan 4.
- **Stripe webhook event subscription**: currently subscribed to 7 events; only `checkout.session.completed` is needed by current code. Trim down in Plan 2 or whenever convenient.
- **Lint cleanup**: 17 pre-existing eslint errors (React Compiler / strict-mode rules, no-explicit-any, unescaped quotes, conditional useEffect in `SiteFooter`). Don't block deploys but worth a sweep in a polish plan.

## Admins

Created via Auth Admin API with `email_confirm:true` (no email needed). Profile `role` set to `admin` immediately after.

| Email | User ID | Created |
|---|---|---|
| ryan@americantattoosociety.com | 2cd26fff-86a3-48ad-bc85-dff890043b39 | 2026-03-02 |
| malia@allamericantattooconvention.com | 2aaac062-ccdd-4b49-b7ac-4586bc52062e | 2026-05-03 |

## Plans status

- **Plan 1 — Vercel deployment:** ✅ complete (2026-05-03)
- **Plan 2 — 2027 pivot + new pricing + form updates:** ✅ complete (2026-05-04)
- **Plan 3 — payment lifecycle (deposit/partial/timeouts):** drafted in spec, plan not yet written
- **Plan 4 — pre-load returners + sponsors + polish:** drafted in spec, plan not yet written

Spec: `docs/superpowers/specs/2026-05-02-aatc-2027-pivot-design.md`.
Plan 1: `docs/superpowers/plans/2026-05-02-aatc-vercel-deployment.md`.
