-- ===========================================================================
-- AI usage meter: plan budgets and usage history.
--
-- Eric, 2026-10-18 12:21 PM ET: a Mission Control page that shows, per AI
-- plan, used vs limit, burn rate and whether the plan runs out before it
-- resets; 12:22 PM: a per-project / per-client breakdown; 12:24 PM: shown as
-- PERCENT of each plan's usage, not dollars.
--
-- Two tables:
--   * ai_plans            one row per plan (Claude Max, ChatGPT/Codex, Grok
--                         Bot Ultra), with its price, limit and reset cadence.
--   * ai_usage_snapshots  aggregated usage. One row per
--                         (plan, source, host, bot, session, project, day).
--                         Counts and metadata only, never prompt or response
--                         text. source = 'log' (collectors parsing local CLI
--                         logs, read-only) or 'manual' (a reading typed in from
--                         a plan's usage page, e.g. Grok Bot Ultra, filled
--                         daily by Chief of Staff).
--
-- project / client: mapped from the session's working directory by
-- scripts/usage/attribution.mjs against config/ai-usage-projects.json. A
-- session that cannot be mapped is stored as 'unattributed', never guessed.
--
-- Writers: the collector on ubuntu-dev (service role, user_id set
-- explicitly, same as scripts/sync). Readers: the app, through the owner
-- policy below. Every statement is schema-qualified mission.
--
-- Rollback: supabase/rollbacks/20261018163500_ai_usage.down.sql
-- ===========================================================================

create table if not exists mission.ai_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  slug             text not null,
  name             text not null,
  vendor           text not null,
  price_usd_month  numeric(10,2),
  -- How the limit is expressed. 'tokens': limit_value is a token budget per
  -- window (an estimate where the vendor does not publish one). 'percent': the
  -- vendor reports percent-used directly (Codex rate limits, manual readings).
  limit_kind       text not null default 'percent'
                     check (limit_kind in ('tokens', 'percent')),
  limit_value      numeric,
  limit_is_estimate boolean not null default true,
  -- Reset window: '5h', 'weekly', 'monthly'. reset_anchor is any one past
  -- reset instant; the next reset is anchor + n * window.
  reset_cadence    text not null default 'weekly'
                     check (reset_cadence in ('5h', 'daily', 'weekly', 'monthly')),
  reset_anchor     timestamptz,
  active           boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists mission.ai_usage_snapshots (
  id                     bigint generated always as identity primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_slug              text not null,
  source                 text not null check (source in ('log', 'manual')),
  -- Usage day in America/New_York (YYYY-MM-DD), not UTC.
  day                    date not null,
  host                   text not null,              -- ubuntu-dev | box | mac-mini | manual
  bot                    text not null,              -- claude-code | codex | grokbot | <agent name>
  session_id             text not null default '',   -- '' for manual rows
  project                text not null default 'unattributed',
  client                 text,
  model                  text,
  messages               integer not null default 0,
  tokens_in              bigint not null default 0,  -- uncached input
  tokens_out             bigint not null default 0,  -- output incl. reasoning
  tokens_cache_read      bigint not null default 0,
  tokens_cache_write     bigint not null default 0,
  tokens_total           bigint not null default 0,  -- sum of the four above
  -- Vendor-reported limits, latest reading of the day (Codex CLI logs them;
  -- manual rows carry the number off the usage page).
  primary_used_pct       numeric,
  primary_window_minutes integer,
  primary_resets_at      timestamptz,
  secondary_used_pct     numeric,
  secondary_window_minutes integer,
  secondary_resets_at    timestamptz,
  -- Manual readings that are not a percent (credits, messages, etc.).
  used_value             numeric,
  limit_value            numeric,
  unit                   text,
  note                   text,
  first_at               timestamptz,
  last_at                timestamptz,
  captured_at            timestamptz not null default now(),
  constraint ai_usage_snapshots_project_nonempty check (length(project) > 0),
  constraint ai_usage_snapshots_unique
    unique (user_id, plan_slug, source, host, bot, session_id, project, day)
);

create index if not exists ai_usage_snapshots_user_day
  on mission.ai_usage_snapshots (user_id, day desc);
create index if not exists ai_usage_snapshots_user_plan_day
  on mission.ai_usage_snapshots (user_id, plan_slug, day desc);

alter table mission.ai_plans enable row level security;
alter table mission.ai_usage_snapshots enable row level security;

drop policy if exists ai_plans_owner on mission.ai_plans;
create policy ai_plans_owner on mission.ai_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists ai_usage_snapshots_owner on mission.ai_usage_snapshots;
create policy ai_usage_snapshots_owner on mission.ai_usage_snapshots
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Daily totals per plan, for the history chart and the forecast.
create or replace view mission.ai_usage_daily
  with (security_invoker = true) as
select
  user_id,
  plan_slug,
  day,
  sum(tokens_total)::bigint       as tokens_total,
  sum(messages)::bigint           as messages,
  count(distinct nullif(session_id, '')) as sessions,
  max(primary_used_pct)           as primary_used_pct,
  max(secondary_used_pct)         as secondary_used_pct,
  max(captured_at)                as captured_at
from mission.ai_usage_snapshots
group by user_id, plan_slug, day;

notify pgrst, 'reload schema';
