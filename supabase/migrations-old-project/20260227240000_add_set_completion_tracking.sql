-- Add completed column to set_logs table for tracking set completion status
-- Defaults to true for backward compatibility with existing records

alter table public.set_logs
  add column if not exists completed boolean default true;

comment on column public.set_logs.completed is 'Whether this set was actually completed during the workout. Used to track skipped or incomplete sets.';
