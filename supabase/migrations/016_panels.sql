-- Panels & panel registrations for tattoo panels / workshops

create type panel_signup_type as enum ('none', 'aatc_invoice', 'email_host', 'free_registration');
create type panel_attendee_type as enum ('artist', 'vendor', 'patron');

create table panels (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events on delete cascade,
  title         text not null,
  description   text not null default '',
  panel_date    text not null default '',
  panel_time    text not null default '',
  location      text not null default '',
  panelists     text not null default '',
  is_free       boolean not null default false,
  cost          int not null default 0,
  signup_type   panel_signup_type not null default 'none',
  host_email    text,
  max_capacity  int,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index panels_event_id_idx on panels (event_id);

create table panel_registrations (
  id                      uuid primary key default gen_random_uuid(),
  panel_id                uuid not null references panels on delete cascade,
  name                    text not null,
  email                   text not null,
  phone                   text,
  social_media            text,
  attendee_type           panel_attendee_type not null default 'patron',
  payment_status          text not null default 'na',
  stripe_payment_intent_id text,
  created_at              timestamptz not null default now()
);

create index panel_registrations_panel_id_idx on panel_registrations (panel_id);

-- Auto-update updated_at
create trigger panels_updated_at
  before update on panels
  for each row execute function handle_updated_at();

-- RLS
alter table panels enable row level security;
alter table panel_registrations enable row level security;

-- Admin full access
create policy "panels: admin all"
  on panels for all using (is_admin());

create policy "panel_registrations: admin all"
  on panel_registrations for all using (is_admin());

-- Public read published panels
create policy "panels: public read"
  on panels for select using (is_published = true);

-- Public insert registrations (for signup forms)
create policy "panel_registrations: public insert"
  on panel_registrations for insert with check (true);

-- Public read own registrations by email (not needed for now, admin reads all)
