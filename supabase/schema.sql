-- Run this in Supabase SQL Editor (Dashboard > SQL > New query)
-- Creates the tables + Row Level Security for Apex Recomp & Health Tracker

-- ============ PROFILES ============
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_lbs numeric default 173,
  height_cm numeric default 179,
  body_fat_current numeric default 23,
  body_fat_goal text default '10-12%',
  gym_frequency text default '5 days/week',
  calorie_target int default 2100,
  protein_target int default 170,
  fat_target int default 60,
  carb_target int default 220,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = user_id);

-- ============ MEAL LOGS ============
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  food_name text not null,
  calories int not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  meal_date date default current_date,
  created_at timestamptz default now()
);

alter table meal_logs enable row level security;

create policy "meal_logs_select_own" on meal_logs
  for select using (auth.uid() = user_id);
create policy "meal_logs_insert_own" on meal_logs
  for insert with check (auth.uid() = user_id);
create policy "meal_logs_update_own" on meal_logs
  for update using (auth.uid() = user_id);
create policy "meal_logs_delete_own" on meal_logs
  for delete using (auth.uid() = user_id);

-- ============ VITALS (daily weigh-ins + weekly trends) ============
create table if not exists vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null,
  morning_weight numeric,
  waist_circumference numeric,
  strength_notes text,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

alter table vitals enable row level security;

create policy "vitals_select_own" on vitals
  for select using (auth.uid() = user_id);
create policy "vitals_insert_own" on vitals
  for insert with check (auth.uid() = user_id);
create policy "vitals_update_own" on vitals
  for update using (auth.uid() = user_id);
create policy "vitals_delete_own" on vitals
  for delete using (auth.uid() = user_id);

-- Optional: index for fast daily lookups
create index if not exists meal_logs_user_date_idx on meal_logs (user_id, meal_date);
create index if not exists vitals_user_date_idx on vitals (user_id, log_date desc);
