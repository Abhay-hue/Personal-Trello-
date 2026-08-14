-- ============================================================
-- Boardroom: minimal AI-driven project board schema
-- Run this in Supabase SQL Editor (or via `supabase db push`)
-- ============================================================

create extension if not exists "pgcrypto";

-- One row per teammate. Linked to Supabase auth.users.
create table if not exists team_members (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  color text not null default '#4b6bfb',
  created_at timestamptz not null default now()
);

-- The board itself.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid references team_members (id) on delete set null,
  created_by uuid references team_members (id) on delete set null,
  due_date timestamptz,
  reminder_sent boolean not null default false,
  overdue_notified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Web Push subscriptions (a person may have more than one device).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references team_members (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- Simple audit trail of AI commands, useful for debugging what the AI did.
create table if not exists ai_command_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references team_members (id) on delete set null,
  input_text text not null,
  parsed_action jsonb,
  result text,
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- This is a small trusted-team tool: any signed-in teammate can
-- read/write everything. Tighten this later if you need per-person
-- permissions.
-- ============================================================

alter table team_members enable row level security;
alter table tasks enable row level security;
alter table push_subscriptions enable row level security;
alter table ai_command_log enable row level security;

create policy "team can read team_members" on team_members
  for select using (auth.role() = 'authenticated');
create policy "team can update own row" on team_members
  for update using (auth.uid() = id);
create policy "team can insert own row" on team_members
  for insert with check (auth.uid() = id);

create policy "team can read tasks" on tasks
  for select using (auth.role() = 'authenticated');
create policy "team can write tasks" on tasks
  for insert with check (auth.role() = 'authenticated');
create policy "team can update tasks" on tasks
  for update using (auth.role() = 'authenticated');
create policy "team can delete tasks" on tasks
  for delete using (auth.role() = 'authenticated');

create policy "team can manage own push subs" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "team can read ai log" on ai_command_log
  for select using (auth.role() = 'authenticated');
create policy "team can insert ai log" on ai_command_log
  for insert with check (auth.role() = 'authenticated');

-- New signups automatically get a team_members row when they first
-- sign in (the frontend calls an upsert, but this trigger is a safety net).
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into team_members (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
