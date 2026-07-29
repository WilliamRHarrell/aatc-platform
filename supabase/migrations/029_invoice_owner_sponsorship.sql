-- ============================================================
-- Migration 029: invoices: own read must reach sponsorship invoices
--
-- Migration 001's policy only ever matched invoices via application_id:
--
--   create policy "invoices: own read"
--     on invoices for select
--     using (
--       exists (
--         select 1 from applications a
--         where a.id = invoices.application_id
--           and a.user_id = auth.uid()
--       )
--     );
--
-- Invoices raised against a sponsorship carry sponsorship_id and a NULL
-- application_id, so they matched nothing: a sponsor logged into /portal could
-- not read their own invoice. That is also why /portal/pay could not resolve a
-- sponsor's balance — it was reading a row RLS denied.
--
-- The replacement routes ownership through a SECURITY DEFINER helper rather
-- than an EXISTS on applications, so the invoices policy no longer touches
-- another RLS-protected table at all. Combined with migration 028, neither
-- side of the old cycle subqueries the other and it cannot re-form.
--
-- auth.uid() is passed in as an argument rather than called inside the
-- definer body: explicit, and it keeps the function usable from a service-role
-- context (e.g. the Stripe webhook) where there is no JWT to read.
-- ============================================================

create or replace function public.owns_invoice(
  p_application_id uuid,
  p_sponsorship_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    p_user_id is not null
    and (
      exists (
        select 1 from public.applications a
         where a.id = p_application_id
           and a.user_id = p_user_id
      )
      or exists (
        select 1 from public.sponsorships s
         where s.id = p_sponsorship_id
           and s.user_id = p_user_id
      )
    );
$$;

revoke all on function public.owns_invoice(uuid, uuid, uuid) from public;
grant execute on function public.owns_invoice(uuid, uuid, uuid) to authenticated;

comment on function public.owns_invoice(uuid, uuid, uuid) is
  'Invoice ownership via either an application or a sponsorship. SECURITY DEFINER so the invoices policy never subqueries an RLS-protected table.';

drop policy if exists "invoices: own read" on invoices;
create policy "invoices: own read"
  on invoices for select
  to authenticated
  using (
    public.owns_invoice(application_id, sponsorship_id, auth.uid())
  );
