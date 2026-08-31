-- Migration: Huawei integration
-- Run this in Supabase SQL Editor (Dashboard > SQL > New query)

-- Per-user Huawei tokens (service role writes here from Netlify Functions).
create table if not exists huawei_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at bigint,
  updated_at timestamptz default now()
);

alter table huawei_tokens enable row level security;

-- The frontend only needs to know IF the user is connected, not the tokens.
-- Netlify Functions use the service_role key to read/write tokens server-side.
create policy "huawei_tokens_select_own" on huawei_tokens
  for select using (auth.uid() = user_id);

-- Huawei master toggle (default ON so demo data shows immediately).
alter table profiles
  add column if not exists huawei_enabled boolean default true;

-- Connect flag for the frontend (true after OAuth succeeds).
alter table profiles
  add column if not exists huawei_connected boolean default false;
