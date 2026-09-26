-- The helper work list: jobs Eric shares with people who help him (his son,
-- a handyman, an assistant), who sign in with an email and password and see
-- that list and nothing else. See docs/DECISIONS/0011-helper-accounts.md.
--
-- THE BOUNDARY. Mission Control holds Eric's whole personal life, and every
-- other table here is owner-only by RLS. Helpers are NOT Supabase users: they
-- have no JWT, so no policy in this project can ever match them, in this app,
-- in FinanceOS or in BibleOS. Every helper read and write goes through server
-- code with the service role, filtered to shared items only. That is the whole
-- design, and the reason helper_accounts and helper_sessions have no policies.
--
-- Every statement is schema-qualified: `tasks` exists in `public` too.

-- The people Eric works with (not mission.people, which is the health
-- module's family table): the assignee lookup, and who a login belongs to.
create table if not exists mission.workers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  -- What they may be sent to do. A helper never sees an electrician's job.
  skills       text[] not null default array['helper']::text[],
  -- Only some people are paid by the hour; only they get clock in/out.
  tracks_hours boolean not null default false,
  hourly_rate  numeric(8,2),
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists workers_owner_name_idx on mission.workers (user_id, lower(name));

-- A person's login. The password is an scrypt hash; the plaintext is never
-- stored. Disabling an account ends its sessions at the next request.
create table if not exists mission.helper_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  worker_id       uuid not null unique references mission.workers(id) on delete cascade,
  email           text not null,
  password_hash   text not null,
  disabled_at     timestamptz,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists helper_accounts_email_idx on mission.helper_accounts (lower(email));

-- Sessions: the cookie holds a random token; only its sha256 is stored, so a
-- reader of this table holds no working session.
create table if not exists mission.helper_sessions (
  token_hash   text primary key,
  account_id   uuid not null references mission.helper_accounts(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz
);
create index if not exists helper_sessions_account_idx on mission.helper_sessions (account_id);

-- Sharing metadata for a task. A side table, not columns on tasks: tasks is
-- also written by the project sync, and nothing about sharing belongs to it.
-- Nothing is shared by being created: `shared` defaults false.
create table if not exists mission.work_items (
  task_id            uuid primary key references mission.tasks(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  shared             boolean not null default false,
  skill              text not null default 'helper',
  -- A FinanceOS real-estate asset, by id. No foreign key: that table belongs
  -- to another app. The label is a snapshot so a helper never reads finances.
  location_asset_id  uuid,
  location_label     text,
  pinned             boolean not null default false,
  sort_order         integer,
  assignee_worker_id uuid references mission.workers(id) on delete set null,
  assignee_name      text,
  -- What a helper reads. The task's own description may be private notes.
  instructions       text,
  materials          text,
  gift_card_note     text,
  gift_card_sent_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint work_items_skill_check check (skill in ('helper','handyman','carpenter','electrician','plumber','roofer','equipment'))
);
create index if not exists work_items_owner_idx on mission.work_items (user_id, shared);

-- Clock in / clock out. Pay data: only Eric, and the helper through server
-- code, ever read it. The title is a snapshot so hours survive a deleted task.
create table if not exists mission.work_time (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid references mission.tasks(id) on delete set null,
  task_title  text not null,
  worker_id   uuid not null references mission.workers(id) on delete cascade,
  account_id  uuid references mission.helper_accounts(id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  constraint work_time_order_check check (ended_at is null or ended_at >= started_at)
);
-- One open clock per person: two would double the pay.
create unique index if not exists work_time_open_idx on mission.work_time (worker_id) where ended_at is null;
create index if not exists work_time_owner_idx on mission.work_time (user_id, started_at desc);

-- Who finished what. A recurring maintenance task stays open and rolls
-- forward, so its own row cannot say who did it; this can.
create table if not exists mission.work_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  task_id      uuid references mission.tasks(id) on delete set null,
  task_title   text not null,
  worker_id    uuid references mission.workers(id) on delete set null,
  account_id   uuid references mission.helper_accounts(id) on delete set null,
  completed_at timestamptz not null default now(),
  note         text
);
create index if not exists work_completions_owner_idx on mission.work_completions (user_id, completed_at desc);

alter table mission.workers           enable row level security;
alter table mission.helper_accounts  enable row level security;
alter table mission.helper_sessions  enable row level security;
alter table mission.work_items       enable row level security;
alter table mission.work_time        enable row level security;
alter table mission.work_completions enable row level security;

-- Owner-only, like the rest of the schema. helper_accounts and helper_sessions
-- get NO policy on purpose: only the service role touches them, so a password
-- hash or a session token hash is never readable through the API by anyone.
drop policy if exists workers_owner on mission.workers;
create policy workers_owner on mission.workers
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists work_items_owner on mission.work_items;
create policy work_items_owner on mission.work_items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists work_time_owner on mission.work_time;
create policy work_time_owner on mission.work_time
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists work_completions_owner on mission.work_completions;
create policy work_completions_owner on mission.work_completions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The API roles get nothing on the two credential tables, RLS or not.
revoke all on mission.helper_accounts from anon, authenticated;
revoke all on mission.helper_sessions from anon, authenticated;

notify pgrst, 'reload schema';
