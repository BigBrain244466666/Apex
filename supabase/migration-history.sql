-- Migration: workout completion + start time + history support
-- Run this in Supabase SQL Editor (Dashboard > SQL > New query)

-- Add completion flag + start time to workouts
alter table workouts
  add column if not exists completed boolean default false;

alter table workouts
  add column if not exists start_time time;

-- Index for faster history queries
create index if not exists workouts_user_completed_idx
  on workouts (user_id, completed, workout_date desc);
