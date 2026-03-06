create table if not exists public.workout_session_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references public.workout_logs(id) on delete cascade,
  file_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists workout_session_photos_user_idx
  on public.workout_session_photos(user_id, created_at desc);

create index if not exists workout_session_photos_workout_idx
  on public.workout_session_photos(workout_log_id, created_at desc);

alter table public.workout_session_photos enable row level security;

drop policy if exists "workout_session_photos_owner" on public.workout_session_photos;
create policy "workout_session_photos_owner"
  on public.workout_session_photos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
