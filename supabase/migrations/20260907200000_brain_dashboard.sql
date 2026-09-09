-- The agent workforce, made visible.
--
-- `~/dev/brain` is the chief-of-staff repo: scheduled jobs, per-client context,
-- and the briefs those jobs produce. Today it exists only as files on one box,
-- so nothing about the workforce is visible in the single pane of glass. These
-- three tables are where `scripts/sync/brain.ts` files what it read.
--
-- SCHEMA IS `mission`. Every statement below is qualified, because `tasks`,
-- `projects` and `notes` also exist in `public` — which is FinanceOS — and an
-- unqualified statement finds that copy and succeeds. See supabase/README.md.
--
-- ONE-WAY, ALWAYS. Git is canonical for all three. Nothing in this app writes
-- back to `~/dev/brain`; a row here is a rendering of a file, and the way to
-- change it is to change the file. That is the same contract `projects.ts`
-- already holds against every other repo, and it is why none of these tables
-- carry an `edited_at` — there is no local edit to protect.

-- ---------------------------------------------------------------------------
-- brain_jobs — every recurring job, from jobs/REGISTRY.md.
--
-- The inventory exists because ~28 jobs currently live in three different
-- mechanisms with nothing listing them together, and the mechanism is not
-- cosmetic: a Vercel cron cannot see ~/dev, so a job needing a repo, `gh` or
-- Claude's judgement can only be a dev-server timer. `mechanism` is therefore
-- a constrained column rather than free text — it is the fact that decides
-- where a job is allowed to live.
-- ---------------------------------------------------------------------------
create table if not exists mission.brain_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Stable identity across runs. NOT the job name on its own: `linksy` and
  -- `trellisv2` both schedule a cron called `send-scheduled-emails`, so a name
  -- alone would collapse two real jobs into one row. Built as
  -- `mechanism:project:name` by the parser.
  source_ref      text not null,
  name            text not null,
  mechanism       text not null,
  -- The machine or platform it actually executes on, which is what `mechanism`
  -- implies but is worth stating: 'ubuntu-dev', 'vercel', 'agents'.
  host            text,
  -- Which repo or Vercel project owns it. Null for the Paperclip heartbeat.
  project         text,
  -- The cron expression where there is one, verbatim.
  schedule        text,
  -- The human reading of the cadence, as the registry writes it.
  cadence         text,
  -- What it does, as the registry writes it. Prose from the file, not inferred.
  what            text,
  -- `jobs/<name>.md`, where the registry names a prompt file.
  prompt_path     text,
  -- The name this job's output files carry, which is NOT its name: the timer is
  -- `job-honey-lake-friday` and the brief is `honey-lake-friday-2026-09-07.md`.
  -- Resolved by the parser and stored, so the page joins on a value rather than
  -- re-deriving a rule that lives in a directory the Next build excludes.
  output_key      text,
  -- Registry prose about whether it is actually working. The Paperclip
  -- heartbeat runs every 30s and has never completed a run; a job list that
  -- could not say so would be worse than no list.
  state           text,
  -- Where it appears in the file, so the page can render it in the author's
  -- order rather than an alphabetical one that loses the grouping.
  position        integer not null default 0,

  last_seen_at    timestamptz,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),

  constraint brain_jobs_mechanism_check
    check (mechanism in ('systemd_timer', 'vercel_cron', 'paperclip', 'on_demand'))
);

create unique index if not exists brain_jobs_ref_idx
  on mission.brain_jobs (user_id, source_ref);

-- ---------------------------------------------------------------------------
-- brain_clients — one row per clients/<slug>/, plus the accounts named in
-- clients/_ownership.md that have no folder yet.
--
-- WHAT IS DELIBERATELY NOT HERE: any prose from the client files. This table
-- holds a status, an owner, a date and a file list — nothing else — because
-- `clients/blue-sky-day/people.md` carries a section marked "never automate"
-- about a contact's father having cancer, recorded so Eric remembers to be a
-- friend. A dashboard that ingested client prose would put it on a screen.
-- The bodies stay in git; this table indexes them.
--
-- `_ownership.md` IS AUTHORITATIVE. It exists because the mailbox misled five
-- separate analyses in one evening — a partner-owned account read as lapsed,
-- equity read as a client, finished work read as abandoned, a deliberate
-- wind-down read as decline. `owner` and `eric_role` come only from that file,
-- and `ownership_governed` marks the rows where it has the final word, so the
-- page can refuse to print a status that contradicts it.
-- ---------------------------------------------------------------------------
create table if not exists mission.brain_clients (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  slug              text not null,
  name              text not null,

  -- From `profile.md`'s stated engagement status. Free text on purpose: the
  -- corpus already says `active`, `sporadic`, `active-delegated` and "`active`,
  -- and deliberately winding down", and flattening that last one into an enum
  -- would delete the only word that matters about that relationship.
  status            text,
  -- Day-to-day owner, from `_ownership.md` and nowhere else.
  owner             text,
  -- Eric's role on the account, from `_ownership.md` and nowhere else.
  eric_role         text,
  -- True when `_ownership.md` names this account. Where it does, an inferred
  -- status may not be shown as dormant, lapsed or at-risk.
  ownership_governed boolean not null default false,

  -- "Last meaningful exchange" as profile.md states it. Null means the file
  -- does not say, which is shown as "not stated" — never back-filled from a
  -- file mtime, which would report when a job last ran, not when Eric last
  -- spoke to anyone.
  last_contact_on   date,

  -- A `_proposed.md` is a change to profile.md or people.md that a weekly run
  -- wrote for Eric to accept. It is the queue this page exists to surface.
  has_proposed      boolean not null default false,
  proposed_at       timestamptz,

  -- Which brain files exist, e.g. ["history.md","open.md","people.md"]. A
  -- client with only people.md has a stub, not a brain, and the difference
  -- should be visible without opening the folder.
  files             jsonb not null default '[]'::jsonb,
  -- False for an account named in `_ownership.md` with no folder at all.
  has_folder        boolean not null default true,

  -- Newest commit touching clients/<slug>/, so staleness is measured against
  -- git rather than a working-tree mtime that a checkout would reset.
  last_commit_at    timestamptz,

  last_seen_at      timestamptz,
  synced_at         timestamptz,
  created_at        timestamptz not null default now()
);

create unique index if not exists brain_clients_slug_idx
  on mission.brain_clients (user_id, slug);

-- ---------------------------------------------------------------------------
-- brain_outputs — the contents of jobs/out/, newest first.
--
-- Separate from mission.briefs rather than folded into it. `briefs` is what
-- this app's own cron generates and mails, constrained to kind
-- weekly|daily; these are files a job wrote on ubuntu-dev and committed to
-- another repo. Same shape on screen, different lineage and different truth
-- about who can change them, so widening the briefs constraint would have
-- merged two things that only look alike.
--
-- The body is stored rather than read at request time, so the page works from
-- Vercel — which cannot see ~/dev at all.
-- ---------------------------------------------------------------------------
create table if not exists mission.brain_outputs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Path relative to the brain repo, e.g. `jobs/out/honey-lake-friday-2026-09-07.md`.
  path         text not null,
  -- The job that produced it, parsed off the filename. Not a foreign key: a
  -- file can exist for a job that was never registered, and that gap is one of
  -- the things worth seeing.
  job_name     text not null,
  produced_on  date not null,

  -- Some jobs emit HTML (the Friday brief is an email), some emit markdown.
  -- Recorded rather than sniffed at render time so both pages agree.
  body         text,
  format       text not null default 'markdown',
  bytes        integer not null default 0,

  -- Newest commit touching this file. run-job.sh commits every brief, so this
  -- is normally the moment it was produced.
  committed_at timestamptz,

  last_seen_at timestamptz,
  synced_at    timestamptz,
  created_at   timestamptz not null default now(),

  constraint brain_outputs_format_check check (format in ('markdown', 'html'))
);

create unique index if not exists brain_outputs_path_idx
  on mission.brain_outputs (user_id, path);
create index if not exists brain_outputs_recent_idx
  on mission.brain_outputs (user_id, produced_on desc);

-- ---------------------------------------------------------------------------
-- `brain` becomes a sync source, so /sync can go red when the harvester stops.
--
-- The constraint is an allowlist, so it has to be replaced rather than added
-- to. Dropped and recreated with the same three values plus the new one.
-- ---------------------------------------------------------------------------
alter table mission.sync_runs drop constraint if exists sync_runs_source_check;
alter table mission.sync_runs add constraint sync_runs_source_check
  check (source in ('projects', 'm365_mail', 'm365_calendar', 'brain'));

-- ---------------------------------------------------------------------------
-- RLS. Same owner rule as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table mission.brain_jobs    enable row level security;
alter table mission.brain_clients enable row level security;
alter table mission.brain_outputs enable row level security;

drop policy if exists brain_jobs_owner on mission.brain_jobs;
create policy brain_jobs_owner on mission.brain_jobs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists brain_clients_owner on mission.brain_clients;
create policy brain_clients_owner on mission.brain_clients
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists brain_outputs_owner on mission.brain_outputs;
create policy brain_outputs_owner on mission.brain_outputs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
