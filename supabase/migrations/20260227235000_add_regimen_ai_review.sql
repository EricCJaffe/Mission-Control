-- Add AI regimen review columns to athlete_profile
alter table public.athlete_profile
  add column if not exists regimen_ai_review jsonb,
  add column if not exists regimen_last_reviewed_at timestamptz;

comment on column public.athlete_profile.regimen_ai_review is 'Complete AI analysis of the full medication/supplement regimen';
comment on column public.athlete_profile.regimen_last_reviewed_at is 'Timestamp of when the full regimen was last analyzed';
