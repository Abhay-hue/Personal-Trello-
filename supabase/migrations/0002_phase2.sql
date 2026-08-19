-- ============================================================
-- Phase 2: Real Notifications
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Granular deadline reminder tiers (24h / 12h / 6h / 2h before).
--    overdue_notified already exists and keeps its job.
alter table tasks add column if not exists reminder_24h_sent boolean not null default false;
alter table tasks add column if not exists reminder_12h_sent boolean not null default false;
alter table tasks add column if not exists reminder_6h_sent boolean not null default false;
alter table tasks add column if not exists reminder_2h_sent boolean not null default false;

-- 2. Editable schedule for non-deadline team pings (lunch, water break,
--    good morning, etc). send_hour_local is 0-23, checked against
--    Asia/Kolkata time by the edge function — change the hour here any
--    time without redeploying code.
create table if not exists team_pings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  message text not null,
  send_hour_local int not null check (send_hour_local between 0 and 23),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into team_pings (key, label, message, send_hour_local) values
  ('good_morning', 'Good morning', 'Good morning team! Let''s have a great day 🌞', 9),
  ('water_break', 'Water break', 'Quick reminder to grab some water 💧', 11),
  ('lunch', 'Lunch reminder', 'Lunch break time — step away for a bit 🍱', 13),
  ('afternoon_break', 'Afternoon break', 'Stretch break — stand up for a minute 🧘', 16),
  ('dinner', 'Dinner reminder', 'Dinner time — wrap up and eat something 🍽️', 19),
  ('good_night', 'Good night', 'Signing off soon? Get some rest tonight 🌙', 20)
on conflict (key) do nothing;

-- Prevents a ping from firing twice in the same local day if the cron
-- job runs more than once inside that hour.
create table if not exists team_ping_log (
  ping_key text not null,
  sent_on date not null,
  created_at timestamptz not null default now(),
  primary key (ping_key, sent_on)
);

-- 3. Appreciation / shoutout messages — manual for now (Phase 2), and
--    this same table becomes the data source for Phase 3's
--    auto-detected "compliments board" later.
create table if not exists appreciations (
  id uuid primary key default gen_random_uuid(),
  from_member uuid references team_members (id) on delete set null,
  to_member uuid references team_members (id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ---- RLS ----
alter table team_pings enable row level security;
alter table team_ping_log enable row level security;
alter table appreciations enable row level security;

create policy "team can read team_pings" on team_pings
  for select using (auth.role() = 'authenticated');
create policy "team can manage team_pings" on team_pings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "team can read ping log" on team_ping_log
  for select using (auth.role() = 'authenticated');

create policy "team can read appreciations" on appreciations
  for select using (auth.role() = 'authenticated');
create policy "team can insert appreciations" on appreciations
  for insert with check (auth.role() = 'authenticated');
