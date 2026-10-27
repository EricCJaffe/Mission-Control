-- mission.bot_activity_items / mission.bot_activity_runs: what every bot did,
-- what is running, and what waits on Eric, for /activity.
--
-- Eric, 2026-10-27 6:28 PM ET (relayed by Chief of Staff): "Build the bot
-- activity page in Mission Control". One page so he does not have to read chat
-- to keep up; he is on the road, so the page is mobile-first.
--
-- WHERE THE ROWS COME FROM. scripts/sync/activity.ts, a 5-minute user timer
-- on ubuntu-dev, reads ~/dev/brain (channel note frontmatter, the open-loops
-- ledger, runs/*.jsonl) and files SCRUBBED rows here: bot display names only,
-- no ids, no email addresses or phone numbers, no note bodies, nothing from
-- Honey Lake beyond "Honey Lake session: <status>". Vercel cannot see ~/dev,
-- which is why this is a harvester and not a reader, the same as brain_jobs.
--
-- ONE-WAY. Git is canonical. A row here is a rendering of a file; the
-- harvester replaces the whole 7-day window each run and deletes what it no
-- longer sees, so there is no local edit to protect and no edited_at.
--
-- READ-ONLY FOR THE APP. The owner policies are SELECT only: the page reads,
-- only the service-role harvester writes, and a signed-in session has no path
-- to change what the bots are reported to have done.
--
-- WHY A RUNS TABLE AND NOT mission.sync_runs. sync_runs constrains `source` to
-- a fixed list, and adding 'bot_activity' to it means dropping and re-adding
-- that constraint. This migration changes no existing object, so the
-- harvester's heartbeat lives beside its rows instead. The R1 data invariant
-- (brain jobs/_data-invariants.tsv) watches it: no ok run in 20 minutes is a
-- violation.
--
-- Additive only: two new tables, their indexes and policies. Nothing existing
-- is altered or dropped.
-- Rollback: supabase/rollbacks/20261027231103_bot_activity.down.sql

create table if not exists mission.bot_activity_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Where the row was read from, and its stable identity across runs, e.g.
  -- `channel:from-grokbot/2026-10-27-x.md:event` or `runs:verify:2026-10-27`.
  source       text not null,
  source_key   text not null,

  -- A display name ("Chief of Staff", "SJCOS session", "Dispatch"); never an
  -- internal id. The harvester maps and scrubs before writing.
  bot          text not null,

  -- Which part of the page it belongs to.
  --   waiting      waits on Eric (column 1)
  --   in_progress  running or queued (column 3, first tab)
  --   finished     done in the last 7 days (column 3, second tab)
  --   event        something happened (column 2, the timeline)
  kind         text not null,
  title        text not null,
  -- Only on `waiting` rows. Decided by the harvester's tested rules
  -- (scripts/sync/parse/activity.ts tagFor).
  tag          text,
  project      text,

  started_at   timestamptz,
  ended_at     timestamptz,
  due_at       timestamptz,
  -- A GitHub pull request URL and nothing else; enforced below so a scrub
  -- miss in the harvester cannot put any other link on the page.
  pr_url       text,
  -- When it happened (event), was first seen (waiting) or last changed.
  occurred_at  timestamptz not null,

  last_seen_at timestamptz,
  synced_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint bot_activity_items_source_check
    check (source in ('channel', 'loops', 'runs')),
  constraint bot_activity_items_kind_check
    check (kind in ('waiting', 'in_progress', 'finished', 'event')),
  constraint bot_activity_items_tag_check
    check (tag is null or tag in ('due_today', 'yes_no', 'approve', 'reply', 'sign', 'action')),
  constraint bot_activity_items_title_len
    check (char_length(title) between 1 and 200),
  constraint bot_activity_items_bot_len
    check (char_length(bot) between 1 and 60),
  constraint bot_activity_items_pr_url_check
    check (pr_url is null or pr_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$')
);

create unique index if not exists bot_activity_items_key_idx
  on mission.bot_activity_items (user_id, source_key);

create index if not exists bot_activity_items_user_kind_occurred_idx
  on mission.bot_activity_items (user_id, kind, occurred_at desc);

alter table mission.bot_activity_items enable row level security;

drop policy if exists bot_activity_items_owner_read on mission.bot_activity_items;
create policy bot_activity_items_owner_read on mission.bot_activity_items
  for select
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- bot_activity_runs: one row per harvester run. The page's "as of" time is
-- the newest ok run, and the invariant reads the same thing.
-- ---------------------------------------------------------------------------
create table if not exists mission.bot_activity_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  items_seen    integer not null default 0,
  items_written integer not null default 0,
  items_removed integer not null default 0,
  -- Counts per source and the window, never item text.
  log           jsonb,
  created_at    timestamptz not null default now(),
  constraint bot_activity_runs_status_check check (status in ('ok', 'error'))
);

create index if not exists bot_activity_runs_user_started_idx
  on mission.bot_activity_runs (user_id, started_at desc);

alter table mission.bot_activity_runs enable row level security;

drop policy if exists bot_activity_runs_owner_read on mission.bot_activity_runs;
create policy bot_activity_runs_owner_read on mission.bot_activity_runs
  for select
  using ((select auth.uid()) = user_id);
