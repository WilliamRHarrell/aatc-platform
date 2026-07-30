-- ============================================================
-- Migration 037: Sponsorship offer / hold expiry
--
-- We hold slots — sometimes at a grandfathered price — against offers that have
-- not been answered. Tattoo Goo is the current example: Gold offered at the
-- pre-July $3,000, no response, and nothing anywhere surfaces how long that has
-- been true. The only record was a sentence in a notes field.
--
-- hold_expires_at makes the age of an offer a queryable property rather than
-- something someone has to remember. Nothing expires automatically — this is
-- deliberately a reporting field, not a lifecycle trigger. The sponsorship
-- lifecycle already has one automated sweep that releases things, and adding a
-- second that silently drops sponsor offers is not a trade worth making.
-- ============================================================

begin;

alter table sponsorships
  add column if not exists hold_expires_at timestamptz;

comment on column sponsorships.hold_expires_at is
  'When a pending offer/hold on this slot lapses. Reporting only — nothing expires automatically. Surfaced as "stale holds" in /admin/sponsorships.';

create index if not exists sponsorships_hold_expires_idx
  on sponsorships (hold_expires_at)
  where hold_expires_at is not null;

-- Tattoo Goo: offered 2026-07-29, give it 30 days to be answered.
-- Safe to re-run — only sets the column when it is still null.
update sponsorships
   set hold_expires_at = timestamptz '2026-08-28 23:59:59-04'
 where sponsor_name = 'Tattoo Goo'
   and status = 'pending'
   and hold_expires_at is null;

do $$
declare n_held int; n_stale int;
begin
  select count(*) into n_held  from sponsorships where hold_expires_at is not null;
  select count(*) into n_stale from sponsorships
   where status = 'pending' and hold_expires_at is not null and hold_expires_at < now();

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sponsorships'
       and column_name = 'hold_expires_at'
  ) then
    raise exception 'Migration 037 FAILED: hold_expires_at column missing.';
  end if;

  raise notice 'Migration 037 OK — % hold(s) tracked, % already lapsed.', n_held, n_stale;
end $$;

commit;
