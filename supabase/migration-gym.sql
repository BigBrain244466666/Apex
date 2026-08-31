-- Migration: Gym / Workout Tracker
-- Run this in Supabase SQL Editor (Dashboard > SQL > New query)
-- Adds workouts, workout_exercises, and exercise_sets with RLS.

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workout_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

alter table workouts enable row level security;
create policy "workouts_select_own" on workouts for select using (auth.uid() = user_id);
create policy "workouts_insert_own" on workouts for insert with check (auth.uid() = user_id);
create policy "workouts_update_own" on workouts for update using (auth.uid() = user_id);
create policy "workouts_delete_own" on workouts for delete using (auth.uid() = user_id);

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references workouts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  exercise_name text not null,
  created_at timestamptz default now()
);

alter table workout_exercises enable row level security;
create policy "workout_exercises_select_own" on workout_exercises for select using (auth.uid() = user_id);
create policy "workout_exercises_insert_own" on workout_exercises for insert with check (auth.uid() = user_id);
create policy "workout_exercises_update_own" on workout_exercises for update using (auth.uid() = user_id);
create policy "workout_exercises_delete_own" on workout_exercises for delete using (auth.uid() = user_id);

create table if not exists exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references workout_exercises(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  set_number int not null default 1,
  weight numeric default 0,
  reps int default 0,
  created_at timestamptz default now()
);

alter table exercise_sets enable row level security;
create policy "exercise_sets_select_own" on exercise_sets for select using (auth.uid() = user_id);
create policy "exercise_sets_insert_own" on exercise_sets for insert with check (auth.uid() = user_id);
create policy "exercise_sets_update_own" on exercise_sets for update using (auth.uid() = user_id);
create policy "exercise_sets_delete_own" on exercise_sets for delete using (auth.uid() = user_id);

create index if not exists workouts_user_date_idx on workouts (user_id, workout_date desc);
create index if not exists workout_exercises_workout_idx on workout_exercises (workout_id);
create index if not exists exercise_sets_exercise_idx on exercise_sets (exercise_id);
