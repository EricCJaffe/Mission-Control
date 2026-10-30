-- mission.decisions: the Decisions inbox, one always-live list of every open
-- decision waiting on Eric and every job stalled on him.
--
-- Eric, 2026-10-30 3:41 PM ET (via Chief of Staff): one always-live link
-- listing every open decision and anything stalled. Tapping an option submits
-- his answer right away (no copy and paste), and the bots pick it up and keep
-- going. Bots add decisions automatically.
--
-- WHO WRITES WHAT
--   ingest   scripts/sync/decisions-inbox.ts on ubuntu-dev (service-role, the
--            same 5-minute unit as /activity) turns brain `kind: decision`
--            notes and stalled queue jobs into rows, upserted on
--            (user_id, source_note). It never overwrites an answer.
--   answer   /api/decisions/[id]/answer, as the signed-in user. RLS plus the
--            column grants below let him set ONLY answer, answer_text, status
--            and answered_at, ONLY on his own open/stale row, ONLY to
--            'answered'. No insert, no delete, no re-answer from the app.
--   deliver  the same box script writes each answered row as a `kind: answer`
--            note in channel/to-grokbot/ (re: the source note), rings Chief of
--            Staff's doorbell, and stamps delivered_at.
--
--   kind          decision (a brain `kind: decision` note) | stalled (a queued
--                 job sitting too long, or waiting on Eric)
--   options       [{"id":"o1","label":"Close","detail":"..."}], scrubbed.
--   default_option an option id: the note's recommendation.
--   urgency       red | yellow | green (never amber: the framework's words).
--   status        open | answered | stale (open past its deadline or 7 days;
--                 still answerable) | withdrawn (the note closed elsewhere).
--
-- No client data: Honey Lake notes are never ingested, and every text column
-- is scrubbed of addresses, phone numbers, ids and links before it is written.
--
-- Additive only. Rollback: supabase/rollbacks/20261030200000_decisions_inbox.down.sql

create table if not exists mission.decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source_note     text not null,
  kind            text not null default 'decision',
  for_agent       text,
  title           text not null,
  context         text,
  options         jsonb not null default '[]'::jsonb,
  default_option  text,
  urgency         text not null default 'yellow',
  deadline        timestamptz,
  status          text not null default 'open',
  answer          text,
  answer_text     text,
  answered_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  delivered_at    timestamptz,
  delivery_ref    text,
  delivery_error  text,

  constraint decisions_user_source_key unique (user_id, source_note),
  constraint decisions_kind_check check (kind in ('decision', 'stalled')),
  constraint decisions_urgency_check check (urgency in ('red', 'yellow', 'green')),
  constraint decisions_status_check check (status in ('open', 'answered', 'stale', 'withdrawn')),
  constraint decisions_options_array check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 8),
  -- An answer is one of the row's own options, or 'other' with his words.
  constraint decisions_answer_check check (
    answer is null
    or (answer = 'other' and answer_text is not null)
    or options @> jsonb_build_array(jsonb_build_object('id', answer))
  ),
  constraint decisions_answered_check check ((status = 'answered') = (answer is not null and answered_at is not null)),
  constraint decisions_default_check check (
    default_option is null or options @> jsonb_build_array(jsonb_build_object('id', default_option))
  ),
  constraint decisions_source_len check (char_length(source_note) between 1 and 300),
  constraint decisions_title_len check (char_length(title) between 1 and 200),
  constraint decisions_context_len check (context is null or char_length(context) <= 1200),
  constraint decisions_answer_text_len check (answer_text is null or char_length(answer_text) between 1 and 1000),
  constraint decisions_for_len check (for_agent is null or char_length(for_agent) <= 60)
);

create index if not exists decisions_user_status_idx
  on mission.decisions (user_id, status, created_at desc);

create index if not exists decisions_undelivered_idx
  on mission.decisions (answered_at)
  where status = 'answered' and delivered_at is null;

alter table mission.decisions enable row level security;

-- Column-level: the app may read his rows and change four columns, nothing
-- else. The service role (ingest/deliver) is unaffected.
revoke all on mission.decisions from anon, authenticated;
grant select on mission.decisions to authenticated;
grant update (answer, answer_text, status, answered_at) on mission.decisions to authenticated;

drop policy if exists decisions_owner_read on mission.decisions;
create policy decisions_owner_read on mission.decisions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- One answer per row: only an unanswered open/stale row, only to 'answered'.
drop policy if exists decisions_owner_answer on mission.decisions;
create policy decisions_owner_answer on mission.decisions
  for update to authenticated
  using ((select auth.uid()) = user_id and status in ('open', 'stale') and answered_at is null)
  with check ((select auth.uid()) = user_id and status = 'answered' and delivered_at is null);

-- The audit time is the database's, not the client's: answering stamps
-- answered_at = now() whatever the request sent.
create or replace function mission.decisions_stamp_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'answered' and old.status is distinct from 'answered' then
    new.answered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists decisions_stamp_answer on mission.decisions;
create trigger decisions_stamp_answer
  before update on mission.decisions
  for each row execute function mission.decisions_stamp_answer();
