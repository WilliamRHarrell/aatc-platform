-- ============================================================
-- Migration 082: protected records cannot be deleted by anything.
-- Verification: supabase/verify/verify_082.sql
-- Data: supabase/seeds/protect_2026_09_26.sql (Skin Reserve booth and
-- in-kind sponsorship, The Pinback Button Club booth)
--
-- WHY. Two teardown files could have deleted Skin Reserve (application
-- 13c265d7, a real comped booth): one ran `delete from applications;` with no
-- filter, the other targeted its owner's address. Both were disabled in #23,
-- but a script can be rewritten or copied; a trigger cannot be forgotten.
--
-- WHAT IS REFUSED (restrict_violation, 23001):
--   - DELETE of a protected application or sponsorship, directly OR by
--     cascade. applications.user_id is ON DELETE CASCADE from auth.users, so
--     deleting a protected application's OWNER ACCOUNT fails as a whole; so
--     does deleting its event.
--   - DELETE of an invoice or exhibitor row belonging to a protected
--     application or sponsorship. A teardown deletes children first; without
--     this the application would survive with its money record gone.
--   - Changing is_protected from the app (any request with a JWT, admin
--     included). Protection is set and lifted only in the SQL Editor or with
--     the service role, where auth.uid() is NULL.
--
-- NOT COVERED: updates. A protected row can still be edited, released from a
-- booth, comped or uncomped through the normal admin screens.
--
-- POLICIES ENUMERATED BEFORE WRITING (applications: own read, own insert,
-- own update, admin all, staff read directory rows; sponsorships: own update,
-- admin write, the 030/038 public read; invoices: own read, admin all;
-- exhibitors: own insert, own read, admin). None is changed; triggers run
-- for every role, including the service role.
-- ============================================================
begin;

alter table public.applications add column if not exists is_protected boolean not null default false;
alter table public.sponsorships add column if not exists is_protected boolean not null default false;
comment on column public.applications.is_protected is
  'A real record that must never be deleted by a teardown, test cleanup or account deletion (082). Set only in SQL.';
comment on column public.sponsorships.is_protected is
  'A real record that must never be deleted by a teardown or test cleanup (082). Set only in SQL.';

-- ── Deletes ───────────────────────────────────────────────────
create or replace function public.refuse_protected_delete()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if tg_table_name in ('applications', 'sponsorships') then
    if old.is_protected then
      raise exception '% % is protected and cannot be deleted (082). Lift protection in SQL first if this is intended.', tg_table_name, old.id
        using errcode = 'restrict_violation';
    end if;
  elsif tg_table_name = 'invoices' then
    if exists (select 1 from public.applications a where a.id = old.application_id and a.is_protected)
       or exists (select 1 from public.sponsorships s where s.id = old.sponsorship_id and s.is_protected) then
      raise exception 'invoice % belongs to a protected record and cannot be deleted (082)', old.id
        using errcode = 'restrict_violation';
    end if;
  elsif tg_table_name = 'exhibitors' then
    if exists (select 1 from public.applications a where a.id = old.application_id and a.is_protected) then
      raise exception 'exhibitor % belongs to a protected application and cannot be deleted (082)', old.id
        using errcode = 'restrict_violation';
    end if;
  end if;
  return old;
end $$;

drop trigger if exists applications_refuse_protected_delete on public.applications;
create trigger applications_refuse_protected_delete before delete on public.applications
  for each row execute function public.refuse_protected_delete();
drop trigger if exists sponsorships_refuse_protected_delete on public.sponsorships;
create trigger sponsorships_refuse_protected_delete before delete on public.sponsorships
  for each row execute function public.refuse_protected_delete();
drop trigger if exists invoices_refuse_protected_delete on public.invoices;
create trigger invoices_refuse_protected_delete before delete on public.invoices
  for each row execute function public.refuse_protected_delete();
drop trigger if exists exhibitors_refuse_protected_delete on public.exhibitors;
create trigger exhibitors_refuse_protected_delete before delete on public.exhibitors
  for each row execute function public.refuse_protected_delete();

-- ── The flag itself: SQL / service role only ──────────────────
create or replace function public.refuse_protection_change()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if new.is_protected is distinct from old.is_protected and auth.uid() is not null then
    raise exception 'is_protected on % % can only be changed in SQL (082)', tg_table_name, old.id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists applications_refuse_protection_change on public.applications;
create trigger applications_refuse_protection_change before update of is_protected on public.applications
  for each row execute function public.refuse_protection_change();
drop trigger if exists sponsorships_refuse_protection_change on public.sponsorships;
create trigger sponsorships_refuse_protection_change before update of is_protected on public.sponsorships
  for each row execute function public.refuse_protection_change();

-- A new row cannot arrive already protected from the app either.
create or replace function public.refuse_protected_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if new.is_protected and auth.uid() is not null then
    new.is_protected := false;
  end if;
  return new;
end $$;

drop trigger if exists applications_refuse_protected_insert on public.applications;
create trigger applications_refuse_protected_insert before insert on public.applications
  for each row execute function public.refuse_protected_insert();
drop trigger if exists sponsorships_refuse_protected_insert on public.sponsorships;
create trigger sponsorships_refuse_protected_insert before insert on public.sponsorships
  for each row execute function public.refuse_protected_insert();

commit;
