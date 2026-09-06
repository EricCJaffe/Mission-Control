-- Fix: ON CONFLICT (user_id, apple_workout_id) could not use the partial index
-- created in 20260730120000 — Postgres will not infer a conflict target from a
-- partial index unless the statement repeats its WHERE predicate, which
-- PostgREST does not emit.
--
-- A plain unique constraint is safe here: Postgres treats NULLs as distinct, so
-- the many rows from other sources with a null apple_workout_id do not collide
-- with each other.

drop index if exists public.workout_logs_apple_workout_id_key;

alter table public.workout_logs
  drop constraint if exists workout_logs_user_apple_workout_unique;

alter table public.workout_logs
  add constraint workout_logs_user_apple_workout_unique
  unique (user_id, apple_workout_id);
