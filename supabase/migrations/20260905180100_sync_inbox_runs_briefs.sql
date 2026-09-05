-- Mission Control as the single pane of glass, part 2 of 3: the three tables
-- that did not exist before — mail that needs a reply, a record of every sync,
-- and every brief that was generated.
--
-- SCHEMA IS `mission`. See part 1 for why that is stated on every line.

-- ---------------------------------------------------------------------------
-- inbox_items — Outlook mail that may be waiting on Eric.
--
-- Deliberately not "every email". The only question this table answers is
-- "who is waiting on me", so it holds a fortnight of Inbox and a computed
-- `needs_reply`. Snippets rather than bodies: enough to recognise the thread,
-- not a second copy of the mailbox sitting in a database that also holds
-- family health records.
-- ---------------------------------------------------------------------------
create table if not exists mission.inbox_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  message_id      text not null,
  thread_id       text,
  sender          text,
  sender_domain   text,
  subject         text,
  received_at     timestamptz,
  snippet         text,
  needs_reply     boolean not null default false,
  replied_at      timestamptz,
  linked_task_id  uuid references mission.tasks(id) on delete set null,
  linked_event_id uuid references mission.calendar_events(id) on delete set null,
  domain          text,
  web_link        text,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  constraint inbox_items_domain_check
    check (domain is null or domain in ('spirit','body','soul','family','work'))
);

-- Unique per account, not globally: the same message id in two accounts is
-- two rows, and scoping the index this way keeps the upsert honest.
create unique index if not exists inbox_items_message_idx
  on mission.inbox_items (user_id, message_id);
create index if not exists inbox_items_needs_reply_idx
  on mission.inbox_items (user_id, needs_reply, received_at desc);

-- ---------------------------------------------------------------------------
-- sync_runs — one row per harvester invocation, successful or not.
--
-- This is what /health reads and what the brief checks before claiming its
-- data is current. A brief built on a sync that died 40 hours ago is worse
-- than no brief, because it looks the same as a good one.
-- ---------------------------------------------------------------------------
create table if not exists mission.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source        text not null,
  status        text not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  items_seen    integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_closed  integer not null default 0,
  dry_run       boolean not null default false,
  error         text,
  log           jsonb,
  constraint sync_runs_status_check check (status in ('running','ok','error')),
  constraint sync_runs_source_check check (source in ('projects','m365_mail','m365_calendar'))
);

create index if not exists sync_runs_source_idx
  on mission.sync_runs (user_id, source, started_at desc);

-- ---------------------------------------------------------------------------
-- briefs — every brief is stored before it is sent.
--
-- So a send failure loses the delivery and not the brief, and so /briefs can
-- show the history without regenerating anything.
-- ---------------------------------------------------------------------------
create table if not exists mission.briefs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  period_start date not null,
  period_end   date not null,
  html         text,
  stats        jsonb,
  generated_at timestamptz not null default now(),
  sent_at      timestamptz,
  sent_to      text,
  send_error   text,
  constraint briefs_kind_check check (kind in ('weekly','daily'))
);

create index if not exists briefs_kind_idx
  on mission.briefs (user_id, kind, period_start desc);

-- ---------------------------------------------------------------------------
-- RLS. Same owner rule the rest of the schema uses.
-- ---------------------------------------------------------------------------
alter table mission.inbox_items enable row level security;
alter table mission.sync_runs   enable row level security;
alter table mission.briefs      enable row level security;

drop policy if exists inbox_items_owner on mission.inbox_items;
create policy inbox_items_owner on mission.inbox_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sync_runs_owner on mission.sync_runs;
create policy sync_runs_owner on mission.sync_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists briefs_owner on mission.briefs;
create policy briefs_owner on mission.briefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
