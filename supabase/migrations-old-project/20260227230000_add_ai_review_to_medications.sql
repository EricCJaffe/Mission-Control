-- Add AI review columns to medications table
alter table public.medications
  add column if not exists ai_review jsonb,
  add column if not exists last_reviewed_at timestamptz;

-- Create index for querying medications with reviews
create index if not exists medications_last_reviewed_idx on public.medications(last_reviewed_at);
