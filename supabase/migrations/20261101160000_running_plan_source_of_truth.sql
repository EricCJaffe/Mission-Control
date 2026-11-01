-- Running plan function: the source of truth for a running plan, its session
-- log, coaching recommendations and the Apple Health access reference.
-- Eric, 2026-11-01 (plan UI modernize, addendum 1).
--
-- Additive only: four new tables in `mission`, nothing in `public`, no change
-- to any existing table. No data: content is loaded per user after merge
-- through the approved db-write path, never from this repo.
--
-- RLS: owner-only on all four, the schema's usual pattern. `authenticated`
-- gets table privileges and RLS narrows them to the caller's own rows; `anon`
-- gets nothing.

create table if not exists mission.running_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  goal        text,
  version     text,
  body        jsonb not null,          -- RunningPlan, src/lib/fitness/running-plan.ts
  body_md     text,                    -- the plan as written, for reference
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One active running plan per user; loading a new one archives the old.
create unique index if not exists running_plans_one_active
  on mission.running_plans (user_id) where status = 'active';
create index if not exists running_plans_user_idx
  on mission.running_plans (user_id, created_at desc);

create table if not exists mission.running_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  plan_id                 uuid references mission.running_plans(id) on delete set null,
  session_date            date not null,
  started_at              timestamptz,
  distance_mi             numeric(6, 2) not null check (distance_mi > 0),
  duration_s              integer check (duration_s is null or duration_s >= 0),
  pace                    text,        -- "14:57" per mile, as recorded
  avg_hr                  smallint,
  max_hr                  smallint,
  z1_pct                  smallint check (z1_pct is null or z1_pct between 0 and 100),
  z2_pct                  smallint check (z2_pct is null or z2_pct between 0 and 100),
  z3_pct                  smallint check (z3_pct is null or z3_pct between 0 and 100),
  z4_pct                  smallint check (z4_pct is null or z4_pct between 0 and 100),
  longest_continuous_min  numeric(5, 1),
  gain_ft                 integer,
  kcal                    integer,
  feel                    smallint check (feel is null or feel between 1 and 10),
  points                  integer,     -- as scored when written; the UI re-scores live
  notes                   text,
  source                  text not null check (source in ('manual', 'garmin_upload', 'apple_health')),
  -- Per-user dedupe: an upload's file fingerprint, `apple:<workout_log id>`,
  -- or `manual:<id>`. The same file or feed row twice is a no-op.
  dedupe_key              text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint running_sessions_user_dedupe_key unique (user_id, dedupe_key)
);
create index if not exists running_sessions_user_date_idx
  on mission.running_sessions (user_id, session_date);
create index if not exists running_sessions_plan_idx
  on mission.running_sessions (plan_id);

create table if not exists mission.coaching_recommendations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     uuid references mission.running_plans(id) on delete cascade,
  ordinal     integer not null,
  text        text not null,
  status      text not null default 'pending_review'
              check (status in ('pending_review', 'accepted', 'declined', 'done')),
  reviewer    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint coaching_recommendations_plan_ordinal_key unique (plan_id, ordinal)
);
create index if not exists coaching_recommendations_user_idx
  on mission.coaching_recommendations (user_id, created_at desc);

create table if not exists mission.health_access_docs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  title       text not null,
  body        text not null,             -- markdown; references only, no secrets
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint health_access_docs_user_slug_key unique (user_id, slug)
);
create index if not exists health_access_docs_user_idx
  on mission.health_access_docs (user_id, updated_at desc);

alter table mission.running_plans            enable row level security;
alter table mission.running_sessions         enable row level security;
alter table mission.coaching_recommendations enable row level security;
alter table mission.health_access_docs       enable row level security;

drop policy if exists running_plans_owner on mission.running_plans;
create policy running_plans_owner on mission.running_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists running_sessions_owner on mission.running_sessions;
create policy running_sessions_owner on mission.running_sessions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists coaching_recommendations_owner on mission.coaching_recommendations;
create policy coaching_recommendations_owner on mission.coaching_recommendations
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists health_access_docs_owner on mission.health_access_docs;
create policy health_access_docs_owner on mission.health_access_docs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on mission.running_plans, mission.running_sessions,
              mission.coaching_recommendations, mission.health_access_docs from anon;
grant select, insert, update, delete on mission.running_plans, mission.running_sessions,
              mission.coaching_recommendations, mission.health_access_docs to authenticated;
