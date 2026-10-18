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
  -- When the percentages above were observed (log rows). Token activity can
  -- be later than the last meter reading; ordering by last_at would let an
  -- old percentage pose as current. Null for manual rows (their day is the
  -- observation).
  meter_at               timestamptz,
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

-- Daily totals per plan, for the history chart and the forecast. Tokens are
-- summed; the vendor percentages are the LATEST reading of the day (a meter
-- that resets mid-day must show the post-reset value, not the max).
create or replace view mission.ai_usage_daily
  with (security_invoker = true) as
with totals as (
  select user_id, plan_slug, day,
         sum(tokens_total)::bigint              as tokens_total,
         sum(messages)::bigint                  as messages,
         count(distinct nullif(session_id, '')) as sessions,
         max(captured_at)                       as captured_at
  from mission.ai_usage_snapshots
  group by user_id, plan_slug, day
), latest as (
  select distinct on (user_id, plan_slug, day)
         user_id, plan_slug, day, primary_used_pct, secondary_used_pct
  from mission.ai_usage_snapshots
  where primary_used_pct is not null or secondary_used_pct is not null
  order by user_id, plan_slug, day, coalesce(meter_at, last_at, captured_at) desc, id desc
)
select t.user_id, t.plan_slug, t.day, t.tokens_total, t.messages, t.sessions,
       l.primary_used_pct, l.secondary_used_pct, t.captured_at
from totals t
left join latest l using (user_id, plan_slug, day);

-- Each collector payload is a complete recount of one host's window, so the
-- uploader REPLACES that host's log rows from p_since on, in one transaction,
-- instead of upserting. That keeps a re-attribution (config edit) or a
-- re-keyed session from leaving the old row behind and double counting.
-- Only source = 'log' rows of one host are touched; manual rows never are.
-- Service role only (the nightly uploader); not callable from the app.
create or replace function mission.ai_usage_replace_log_window(
  p_user_id uuid, p_host text, p_since date, p_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if p_host is null or p_host in ('', 'manual') then
    raise exception 'ai_usage_replace_log_window: bad host %', p_host;
  end if;
  delete from mission.ai_usage_snapshots
   where user_id = p_user_id and source = 'log' and host = p_host and day >= p_since;
  insert into mission.ai_usage_snapshots (
    user_id, plan_slug, source, day, host, bot, session_id, project, client, model,
    messages, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write, tokens_total,
    primary_used_pct, primary_window_minutes, primary_resets_at,
    secondary_used_pct, secondary_window_minutes, secondary_resets_at,
    meter_at, first_at, last_at, captured_at)
  select p_user_id, r.plan_slug, 'log', r.day, p_host, r.bot, coalesce(r.session_id, ''),
         coalesce(nullif(r.project, ''), 'unattributed'), r.client, r.model,
         coalesce(r.messages, 0), coalesce(r.tokens_in, 0), coalesce(r.tokens_out, 0),
         coalesce(r.tokens_cache_read, 0), coalesce(r.tokens_cache_write, 0), coalesce(r.tokens_total, 0),
         r.primary_used_pct, r.primary_window_minutes, r.primary_resets_at,
         r.secondary_used_pct, r.secondary_window_minutes, r.secondary_resets_at,
         r.meter_at, r.first_at, r.last_at, now()
    from jsonb_to_recordset(p_rows) as r(
      plan_slug text, day date, bot text, session_id text, project text, client text, model text,
      messages integer, tokens_in bigint, tokens_out bigint, tokens_cache_read bigint,
      tokens_cache_write bigint, tokens_total bigint,
      primary_used_pct numeric, primary_window_minutes integer, primary_resets_at timestamptz,
      secondary_used_pct numeric, secondary_window_minutes integer, secondary_resets_at timestamptz,
      meter_at timestamptz, first_at timestamptz, last_at timestamptz)
   where r.day >= p_since;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function mission.ai_usage_replace_log_window(uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function mission.ai_usage_replace_log_window(uuid, text, date, jsonb) to service_role;

notify pgrst, 'reload schema';
