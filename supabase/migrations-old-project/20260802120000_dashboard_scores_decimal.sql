-- Spirit / Soul / Body are now derived from the Flourishing survey, which
-- averages 0-10 domain scores and so lands on decimals (e.g. Soul 6.08).
-- These columns were integer, which silently rejected those values.
--
-- Widening to numeric(4,2) is lossless for the existing hand-entered integers
-- and keeps one meaningful decimal of survey precision.

alter table public.dashboard_scores
  alter column spirit type numeric(4,2) using spirit::numeric,
  alter column soul type numeric(4,2) using soul::numeric,
  alter column body type numeric(4,2) using body::numeric;

-- Records where the numbers came from, so a hand-authored row is
-- distinguishable from one the survey produced.
alter table public.dashboard_scores
  add column if not exists source text not null default 'manual',
  add column if not exists assessment_id uuid references public.flourishing_assessments(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

alter table public.dashboard_scores drop constraint if exists dashboard_scores_source_check;
alter table public.dashboard_scores
  add constraint dashboard_scores_source_check
  check (source in ('manual', 'flourishing'));

create index if not exists dashboard_scores_user_created_idx
  on public.dashboard_scores (user_id, created_at desc);
