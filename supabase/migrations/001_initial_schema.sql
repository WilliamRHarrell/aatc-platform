-- ============================================================
-- AATC Platform — Initial Schema
-- Run this in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────
create type user_role        as enum ('admin', 'exhibitor', 'public');
create type exhibitor_type   as enum ('artist', 'vendor');
create type booth_size       as enum ('single', 'double', 'triple', 'quad');
create type application_status as enum ('pending', 'approved', 'rejected', 'waitlisted');
create type booth_status     as enum ('available', 'reserved', 'sold');
create type invoice_status   as enum ('pending', 'paid', 'overdue', 'cancelled');
create type sponsor_tier     as enum ('platinum', 'gold', 'silver', 'bronze');
create type sponsor_status   as enum ('pending', 'confirmed', 'cancelled');

-- ── updated_at trigger function ───────────────────────────────
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLES
-- ============================================================

-- ── events ───────────────────────────────────────────────────
create table events (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  venue                   text not null,
  city                    text not null,
  state                   text not null,
  start_date              date not null,
  end_date                date not null,
  registration_open_date  date,
  is_active               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger events_updated_at
  before update on events
  for each row execute function handle_updated_at();

-- ── profiles ─────────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'public',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Helper: is current user admin? (must come after profiles table) ──
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── applications ─────────────────────────────────────────────
create table applications (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events on delete cascade,
  user_id          uuid not null references auth.users on delete cascade,
  exhibitor_type   exhibitor_type not null,
  business_name    text not null,
  contact_name     text not null,
  email            text not null,
  phone            text,
  website          text,
  instagram        text,
  booth_size       booth_size not null,
  artist_count     int not null default 1 check (artist_count >= 0),
  is_corner        boolean not null default false,
  is_veteran       boolean not null default false,
  total_amount     int not null check (total_amount >= 0),  -- cents
  status           application_status not null default 'pending',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index applications_event_id_idx  on applications (event_id);
create index applications_user_id_idx   on applications (user_id);
create index applications_status_idx    on applications (status);

create trigger applications_updated_at
  before update on applications
  for each row execute function handle_updated_at();

-- ── booths ───────────────────────────────────────────────────
create table booths (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events on delete cascade,
  application_id   uuid references applications on delete set null,
  booth_number     text not null,
  size             booth_size not null,
  is_corner        boolean not null default false,
  x                numeric not null default 0,
  y                numeric not null default 0,
  width            numeric not null default 1,
  height           numeric not null default 1,
  status           booth_status not null default 'available',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_id, booth_number)
);

create index booths_event_id_idx  on booths (event_id);
create index booths_status_idx    on booths (status);

create trigger booths_updated_at
  before update on booths
  for each row execute function handle_updated_at();

-- ── exhibitors ───────────────────────────────────────────────
create table exhibitors (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references applications on delete cascade,
  event_id         uuid not null references events on delete cascade,
  business_name    text not null,
  contact_name     text not null,
  email            text not null,
  phone            text,
  website          text,
  instagram        text,
  exhibitor_type   exhibitor_type not null,
  booth_id         uuid references booths on delete set null,
  bio              text,
  logo_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index exhibitors_event_id_idx on exhibitors (event_id);
create index exhibitors_booth_id_idx on exhibitors (booth_id);

create trigger exhibitors_updated_at
  before update on exhibitors
  for each row execute function handle_updated_at();

-- ── invoices ─────────────────────────────────────────────────
create table invoices (
  id                        uuid primary key default gen_random_uuid(),
  application_id            uuid not null references applications on delete cascade,
  stripe_payment_intent_id  text unique,
  stripe_invoice_id         text unique,
  amount                    int not null check (amount >= 0),  -- cents
  status                    invoice_status not null default 'pending',
  due_date                  date,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index invoices_application_id_idx on invoices (application_id);
create index invoices_status_idx         on invoices (status);

create trigger invoices_updated_at
  before update on invoices
  for each row execute function handle_updated_at();

-- ── contests ─────────────────────────────────────────────────
create table contests (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events on delete cascade,
  name            text not null,
  description     text,
  scheduled_time  timestamptz,
  "order"         int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index contests_event_id_idx on contests (event_id);
create index contests_order_idx    on contests (event_id, "order");

create trigger contests_updated_at
  before update on contests
  for each row execute function handle_updated_at();

-- ── sponsorships ─────────────────────────────────────────────
create table sponsorships (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events on delete cascade,
  sponsor_name  text not null,
  tier          sponsor_tier not null,
  logo_url      text,
  website       text,
  amount        int not null default 0 check (amount >= 0),  -- cents
  status        sponsor_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index sponsorships_event_id_idx on sponsorships (event_id);

create trigger sponsorships_updated_at
  before update on sponsorships
  for each row execute function handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table events        enable row level security;
alter table profiles      enable row level security;
alter table applications  enable row level security;
alter table booths        enable row level security;
alter table exhibitors    enable row level security;
alter table invoices      enable row level security;
alter table contests      enable row level security;
alter table sponsorships  enable row level security;

-- ── events ───────────────────────────────────────────────────
create policy "events: public read"
  on events for select using (true);

create policy "events: admin write"
  on events for all using (is_admin());

-- ── profiles ─────────────────────────────────────────────────
create policy "profiles: own read/update"
  on profiles for select using (auth.uid() = id);

create policy "profiles: own update"
  on profiles for update using (auth.uid() = id);

create policy "profiles: admin read all"
  on profiles for select using (is_admin());

create policy "profiles: admin update all"
  on profiles for update using (is_admin());

-- ── applications ─────────────────────────────────────────────
create policy "applications: own read"
  on applications for select using (auth.uid() = user_id);

create policy "applications: own insert"
  on applications for insert with check (auth.uid() = user_id);

create policy "applications: admin all"
  on applications for all using (is_admin());

-- ── booths ───────────────────────────────────────────────────
create policy "booths: public read"
  on booths for select using (true);

create policy "booths: admin write"
  on booths for all using (is_admin());

-- ── exhibitors ───────────────────────────────────────────────
create policy "exhibitors: public read"
  on exhibitors for select using (true);

create policy "exhibitors: admin write"
  on exhibitors for all using (is_admin());

-- ── invoices ─────────────────────────────────────────────────
create policy "invoices: own read"
  on invoices for select
  using (
    exists (
      select 1 from applications a
      where a.id = invoices.application_id
        and a.user_id = auth.uid()
    )
  );

create policy "invoices: admin all"
  on invoices for all using (is_admin());

-- ── contests ─────────────────────────────────────────────────
create policy "contests: public read"
  on contests for select using (true);

create policy "contests: admin write"
  on contests for all using (is_admin());

-- ── sponsorships ─────────────────────────────────────────────
create policy "sponsorships: public read"
  on sponsorships for select using (true);

create policy "sponsorships: admin write"
  on sponsorships for all using (is_admin());

-- ============================================================
-- Done — run seed.sql next to insert the AATC 2027 event
-- ============================================================
