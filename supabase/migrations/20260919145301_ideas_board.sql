-- The idea board.
--
-- Eric, 2026-09-19: "i always seem to have ideas and dont want to forget them
-- ... simple functionality like a mini to do- no due date but maybe you can
-- have a time stamp so you can add to the weekly brief an idea section to keep
-- it before me periodically and note how long its been since i've touched it."
--
-- WHY THIS IS NOT A TASK WITH A FLAG
--
-- A task is a commitment: it has a due date, it can be overdue, and the brief
-- shames you for it. An idea is the opposite -- it is allowed to sit. Filing
-- ideas in `mission.tasks` would put them into the overdue arithmetic, the
-- stale-task verdicts and the alignment check, and within a week the honest
-- response would be to stop capturing them. Separate table, no due date, and
-- the only clock on it measures attention rather than lateness.
--
-- THE TWO TIMESTAMPS ARE NOT THE SAME CLOCK, AND THAT IS THE POINT
--
-- `updated_at` moves whenever any process writes the row -- a re-import, a
-- domain backfill, a later migration. `touched_at` moves only when Eric
-- himself engages with the idea: capturing it, editing it, pressing "still
-- alive", or promoting it. The brief's "idle 24 days" reads `touched_at`,
-- because a number that a background job can reset is not a measure of
-- neglect. Nothing but a deliberate human action may write it.

create table if not exists mission.ideas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- One line, the way it arrives in the head. Everything else is optional.
  title       text not null,
  -- The fuller thought, markdown, for when one line was not enough.
  body        text,

  -- Same five values as tasks and calendar_events, so `matrixKeyFor` sorts an
  -- idea into God First / Health / Family / Impact without a second mapping.
  domain      text,

  status      text not null default 'open',

  -- When the thought arrived. Never rewritten.
  captured_at timestamptz not null default now(),
  -- When Eric last engaged with it. See the header: this is the brief's clock.
  touched_at  timestamptz not null default now(),
  -- How many times he has come back to it without acting. A high count with a
  -- long idle gap is a different thing from a thought recorded once and left:
  -- the first is a decision being avoided, the second is a note.
  touch_count integer not null default 0,

  -- Set when the idea becomes a project. Kept rather than deleted so the board
  -- can show what it has produced, which is the only argument for capturing
  -- ideas at all.
  promoted_project_id uuid references mission.projects(id) on delete set null,
  promoted_at         timestamptz,

  -- Where it came from. `idea_skill` is the `/idea` slash command, which is the
  -- path this table was actually built for.
  source      text not null default 'manual',
  -- A stable id for the capture, so a job that reads the same mail twice
  -- cannot file the same idea twice.
  source_ref  text,
  source_url  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint ideas_status_check
    check (status in ('open', 'promoted', 'parked', 'killed')),
  constraint ideas_domain_check
    check (domain is null or domain in ('spirit', 'body', 'soul', 'family', 'work')),
  constraint ideas_source_check
    check (source in ('manual', 'idea_skill', 'email', 'brief', 'note'))
);

-- The board's own order: oldest attention first.
create index if not exists ideas_open_idle_idx
  on mission.ideas (user_id, touched_at asc)
  where status = 'open';

-- Deduplication for anything capturing on a schedule. Partial, because a
-- hand-typed idea has no source_ref and two of those are two ideas.
create unique index if not exists ideas_source_ref_idx
  on mission.ideas (user_id, source_ref)
  where source_ref is not null;

-- ---------------------------------------------------------------------------
-- RLS. Same owner rule as the rest of the schema.
-- ---------------------------------------------------------------------------
alter table mission.ideas enable row level security;

drop policy if exists ideas_owner on mission.ideas;
create policy ideas_owner on mission.ideas
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Promotion: idea -> project (+ optional starter tasks), in one transaction.
--
-- A function rather than three calls from the route, because the half-done
-- state is genuinely bad: a project created from an idea that still reads as
-- open is a duplicate the next brief will nag about.
--
-- SECURITY INVOKER (the default) on purpose -- RLS then applies to every row it
-- writes, so the function cannot reach another user's idea even if called with
-- one's id.
-- ---------------------------------------------------------------------------
create or replace function mission.promote_idea(
  p_idea_id     uuid,
  p_task_titles text[] default '{}'
)
returns uuid
language plpgsql
set search_path = mission, public, pg_catalog
as $$
declare
  v_idea    mission.ideas%rowtype;
  v_project uuid;
  v_title   text;
begin
  select * into v_idea from mission.ideas where id = p_idea_id;
  if not found then
    raise exception 'idea % not found', p_idea_id;
  end if;
  if v_idea.promoted_project_id is not null then
    return v_idea.promoted_project_id;
  end if;

  insert into mission.projects (user_id, title, description, status, domain)
  values (v_idea.user_id, v_idea.title, v_idea.body, 'active', v_idea.domain)
  returning id into v_project;

  -- No due dates. An idea that becomes a project does not thereby acquire a
  -- deadline, and inventing one here would put a date in front of Eric that
  -- nobody chose.
  foreach v_title in array coalesce(p_task_titles, '{}')
  loop
    if length(btrim(v_title)) > 0 then
      insert into mission.tasks (user_id, project_id, title, status, domain, source)
      values (v_idea.user_id, v_project, btrim(v_title), 'todo', v_idea.domain, 'manual');
    end if;
  end loop;

  update mission.ideas
     set status = 'promoted',
         promoted_project_id = v_project,
         promoted_at = now(),
         touched_at = now(),
         touch_count = touch_count + 1,
         updated_at = now()
   where id = p_idea_id;

  return v_project;
end;
$$;

revoke execute on function mission.promote_idea(uuid, text[]) from public;
grant execute on function mission.promote_idea(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
