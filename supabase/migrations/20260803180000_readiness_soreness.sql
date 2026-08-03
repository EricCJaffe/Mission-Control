-- Musculoskeletal readiness, and honest handling of missing factors.
--
-- soreness_score is the self-reported factor drawn from recovery_sessions —
-- the only musculoskeletal signal in the readiness model. HRV can look fine
-- while your legs are too sore to squat, and nothing else captured that.
--
-- recovery_context holds the modality summary (sessions logged, days since
-- last, which modalities). It sits BESIDE the score rather than inside it:
-- crediting readiness for logging a sauna both double-counts the benefit
-- (which, if real, already shows up in HRV, RHR and sleep) and makes the score
-- raisable by logging rather than by recovering.
--
-- missing_factors records which inputs had no data on a given day. Factor
-- scores are nullable and now genuinely mean "not measured" — previously a
-- missing blood-pressure reading was scored 80 and a missing weather reading
-- 100, so an absent input silently propped the composite up.

alter table public.daily_readiness
  add column if not exists soreness_score integer,
  add column if not exists recovery_context jsonb,
  add column if not exists missing_factors text[] not null default '{}';

comment on column public.daily_readiness.soreness_score is
  'Self-reported musculoskeletal readiness 0-100 from recovery_sessions ratings. NULL when nothing recent was rated.';
comment on column public.daily_readiness.recovery_context is
  'Recovery modality summary shown beside readiness. Deliberately not an input to readiness_score.';
comment on column public.daily_readiness.missing_factors is
  'Factors excluded from readiness_score for want of data. A long list means a thin score.';
