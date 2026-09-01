-- Admin migration: admin flag, per-user feature toggles, admin policies
-- Run in Supabase SQL Editor.

-- Feature toggles for each user (default all ON)
alter table profiles
  add column if not exists is_admin boolean default false;

alter table profiles
  add column if not exists email text;

alter table profiles
  add column if not exists meals_enabled boolean default true;

alter table profiles
  add column if not exists gym_enabled boolean default true;

alter table profiles
  add column if not exists history_enabled boolean default true;

alter table profiles
  add column if not exists vitals_enabled boolean default true;

alter table profiles
  add column if not exists huawei_enabled boolean default true;

-- Admin can read + update all profiles (but NOT insert/delete)
drop policy if exists "admin_select_all_profiles" on profiles;
create policy "admin_select_all_profiles" on profiles
  for select
  using (exists (
    select 1 from profiles p
    where p.user_id = auth.uid() and p.is_admin = true
  ));

drop policy if exists "admin_update_all_profiles" on profiles;
create policy "admin_update_all_profiles" on profiles
  for update
  using (exists (
    select 1 from profiles p
    where p.user_id = auth.uid() and p.is_admin = true
  ));
