-- Add AI review support to medications table
-- Stores AI analysis results and recommendations for medication regimen

alter table public.medications
  add column if not exists ai_review jsonb,
  add column if not exists last_reviewed_at timestamptz;

comment on column public.medications.ai_review is 'AI-generated review including interactions, warnings, and recommendations';
comment on column public.medications.last_reviewed_at is 'Timestamp of last AI medication review';

-- Index for querying medications needing review
create index if not exists medications_last_reviewed_idx
  on public.medications(user_id, last_reviewed_at);
