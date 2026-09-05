-- Mission Control as the single pane of glass, part 1 of 3: the domain
-- vocabulary, and the columns a sync needs on tables that already exist.
--
-- SCHEMA IS `mission`, NOT `public`. Every statement here is schema-qualified
-- on purpose. `public` in this database is FinanceOS, and several of these
-- table names (tasks, projects) exist in both. An unqualified statement would
-- alter the wrong app's tables and succeed while doing it.
--
-- THE FIVE DOMAINS carry the priority matrix from ~/CLAUDE.md §2b:
--
--     God First = spirit | Health = body + soul | Family = family | Impact = work
--
-- Stored as text with a check rather than a Postgres enum, because `domain`
-- already exists as text on calendar_events, daily_priorities and goals, and
-- converting live columns to an enum to gain nothing is not worth the lock.
-- Adding a sixth domain later is one ALTER per column instead of an ALTER TYPE.

-- ---------------------------------------------------------------------------
-- Legacy values first. The three existing domain columns carry matrix labels
-- ("God First", "Health") rather than domains, so the check below would fail
-- on live rows if they were not translated first.
-- ---------------------------------------------------------------------------
update mission.calendar_events  set domain = 'body'   where domain = 'Health';
update mission.calendar_events  set domain = 'spirit' where domain = 'God First';
update mission.daily_priorities set domain = 'body'   where domain = 'Health';
update mission.daily_priorities set domain = 'spirit' where domain = 'God First';
update mission.goals            set domain = 'body'   where domain = 'Health';
update mission.goals            set domain = 'spirit' where domain = 'God First';

-- ---------------------------------------------------------------------------
-- The vocabulary, applied everywhere a domain is recorded. Null stays legal
-- throughout: an unclassified item is a real state, and forcing a guess at
-- sync time is how everything silently becomes `work`.
-- ---------------------------------------------------------------------------
alter table mission.projects add column if not exists domain text;
alter table mission.tasks    add column if not exists domain text;

do $$
declare t text;
begin
  foreach t in array array['projects', 'tasks', 'calendar_events', 'daily_priorities', 'goals']
  loop
    execute format('alter table mission.%I drop constraint if exists %I', t, t || '_domain_check');
    execute format(
      'alter table mission.%I add constraint %I check (domain is null or domain in (''spirit'',''body'',''soul'',''family'',''work''))',
      t, t || '_domain_check');
  end loop;
end $$;

-- Backfill from the category free-text that predates the domains. Only the
-- unambiguous ones: "Writing / Content" could be soul or work depending on
-- whether it is a sermon or a client deliverable, so it is left null rather
-- than guessed.
update mission.tasks set domain = 'body' where domain is null and category = 'Health';
update mission.tasks set domain = 'work' where domain is null and category in ('Impact / Clients', 'Admin');

-- ---------------------------------------------------------------------------
-- projects: one row per sub-project under ~/dev, plus whatever is created by
-- hand. `slug` is the directory name and the join key the harvester uses.
-- ---------------------------------------------------------------------------
alter table mission.projects add column if not exists slug           text;
alter table mission.projects add column if not exists repo_path      text;
alter table mission.projects add column if not exists client         text;
alter table mission.projects add column if not exists sync_enabled   boolean not null default true;
alter table mission.projects add column if not exists last_synced_at timestamptz;

create unique index if not exists projects_user_slug_idx
  on mission.projects (user_id, slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- tasks: where a task came from, and whether the harvester still sees it.
--
-- `source_ref` is the stable identity of an item inside its source — for a
-- markdown checkbox, the repo-relative file path plus a hash of the heading
-- path and title. It has to survive the file being reordered and lines being
-- inserted above it, which a line number would not.
--
-- `edited_at` is what makes the sync safe to run every two hours: once a task
-- has been touched here, Mission Control owns its status, priority, due date
-- and domain, and the source may only update the title and description. A
-- sync that overwrote a decision made in the UI would train you to stop
-- making decisions in the UI.
-- ---------------------------------------------------------------------------
alter table mission.tasks add column if not exists source          text not null default 'manual';
alter table mission.tasks add column if not exists source_ref      text;
alter table mission.tasks add column if not exists source_url      text;
alter table mission.tasks add column if not exists external_status text;
alter table mission.tasks add column if not exists assignee        text;
alter table mission.tasks add column if not exists last_seen_at    timestamptz;
alter table mission.tasks add column if not exists synced_at       timestamptz;
alter table mission.tasks add column if not exists edited_at       timestamptz;

alter table mission.tasks drop constraint if exists tasks_source_check;
alter table mission.tasks add constraint tasks_source_check check (
  source in ('manual','todo_md','claude_md','github_issue','code_todo','monday','email','calendar')
);

alter table mission.tasks drop constraint if exists tasks_external_status_check;
alter table mission.tasks add constraint tasks_external_status_check check (
  external_status is null or external_status in ('open','done','gone')
);

-- Scoped by user as well as by source: source_ref is unique within one
-- person's ~/dev, not across accounts.
create unique index if not exists tasks_source_ref_idx
  on mission.tasks (user_id, source, source_ref)
  where source <> 'manual' and source_ref is not null;

create index if not exists tasks_domain_status_idx on mission.tasks (user_id, domain, status);
create index if not exists tasks_project_status_idx on mission.tasks (user_id, project_id, status);

-- ---------------------------------------------------------------------------
-- calendar_events: the Graph side. `external_id` is the Graph event id.
-- ---------------------------------------------------------------------------
alter table mission.calendar_events add column if not exists external_id text;
alter table mission.calendar_events add column if not exists attendees   text[];
alter table mission.calendar_events add column if not exists is_external boolean not null default false;
alter table mission.calendar_events add column if not exists has_prep    boolean not null default false;
alter table mission.calendar_events add column if not exists location    text;
alter table mission.calendar_events add column if not exists web_link    text;
alter table mission.calendar_events add column if not exists synced_at   timestamptz;

create unique index if not exists calendar_events_external_idx
  on mission.calendar_events (user_id, external_id) where external_id is not null;

notify pgrst, 'reload schema';
