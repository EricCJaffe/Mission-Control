-- ============================================================
-- FITNESS STANDARDS
--
-- A standard is a fixed protocol you retest on purpose, scored the same way
-- every time so the numbers are comparable across years.
--
-- This is deliberately not personal_records and not workout_templates:
--   - personal_records is movement-level and derived from whatever you happened
--     to log. It has no protocol, so two "max pull-ups" rows may not be the
--     same test.
--   - workout_templates describe what to do but carry no score.
-- A standard is the protocol plus the score plus the retest cadence.
-- ============================================================

create table if not exists public.fitness_standards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null check (kind in ('benchmark_workout','movement','endurance')),
  -- Where the protocol comes from, e.g. 'CrossFit', 'DJ Shipley'. Free text.
  source text,
  -- The rules of the test, in full. If this changes, the history stops being
  -- comparable — so it is written out rather than implied by the name.
  protocol text not null,

  score_type text not null check (score_type in (
    'time_seconds','duration_seconds','reps','weight_lbs','distance_meters'
  )),
  -- Time-to-complete goes down as you improve; reps and load go up.
  lower_is_better boolean not null default false,

  -- What the tiers are compared against. 'score_per_bodyweight' is for lifts
  -- graded as a multiple of bodyweight, where the raw pounds mean little on
  -- their own.
  grade_on text not null default 'score'
    check (grade_on in ('score','score_per_bodyweight')),

  -- [{label, min, max}] against the grade value, either bound nullable for the
  -- open-ended top and bottom bands.
  --
  -- Empty is the normal case, not a gap to be filled in later with guesses.
  -- Most of these tests have no published table, and inventing thresholds would
  -- put a number on screen that nobody measured. An ungraded standard shows the
  -- mark, the trend and the target, which is the part that actually matters.
  tiers jsonb not null default '[]'::jsonb,
  -- Who says so, and how authoritative they are. Required whenever tiers is
  -- non-empty so the UI can show the provenance next to the grade.
  tier_source text,

  -- A number to aim at. Unlike tiers this is Eric's own, so it is never
  -- presented as a standard anyone else set.
  target_score numeric,

  template_id uuid references public.workout_templates(id) on delete set null,
  retest_interval_days integer,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint fitness_standards_user_slug_unique unique (user_id, slug),
  -- A grade with no stated source is exactly what this table is trying to avoid.
  constraint fitness_standards_tiers_need_source
    check (tiers = '[]'::jsonb or tier_source is not null)
);

create index if not exists fitness_standards_user_id_idx on public.fitness_standards(user_id);

create index if not exists fitness_standards_kind_idx on public.fitness_standards(kind);

alter table public.fitness_standards enable row level security;

create policy "fitness_standards_owner" on public.fitness_standards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- STANDARD ATTEMPTS — one row per retest
-- ============================================================
create table if not exists public.standard_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  standard_id uuid not null references public.fitness_standards(id) on delete cascade,
  performed_on date not null,
  score numeric not null,

  -- Snapshot, so a bodyweight-relative lift stays true when the scale moves.
  -- Null means it was not recorded, and the ratio is simply not shown.
  bodyweight_lbs numeric,

  -- Rx means the protocol was followed as written. Scaled attempts are kept
  -- and charted, but never counted as a best — a scaled score and an Rx score
  -- are not the same test.
  rx boolean not null default true,
  -- What was scaled, or what load was carried: 'vest', '20 lb vest,
  -- partitioned', '53 lb KB'.
  conditions text,

  workout_log_id uuid references public.workout_logs(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);

create index if not exists standard_attempts_user_id_idx on public.standard_attempts(user_id);

create index if not exists standard_attempts_standard_idx
  on public.standard_attempts(standard_id, performed_on desc);

alter table public.standard_attempts enable row level security;

create policy "standard_attempts_owner" on public.standard_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.fitness_standards.tiers is
  'Grading bands against grade_on. Empty when no published standard exists — do not fill with estimates.';

comment on column public.standard_attempts.rx is
  'Protocol followed as written. Scaled attempts chart but never set a best.';
