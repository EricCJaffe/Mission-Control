-- Decisions inbox, round two: /decisions as the one place Eric acts.
-- Eric, 2026-10-31: "An email that I can't take action on though is kind of
-- useless." Additive only; rollback in supabase/rollbacks/.
--
-- 1. Item fields on mission.decisions, written by the box script
--    (scripts/sync/decisions-inbox.ts), never by the app:
--      pr_ref        owner/repo#n when the note names a pull request
--      next_step     what happens next, shown in the Stalled section
--      dedupe_key    one row per underlying item: pr:<ref>, else the note path
--      closed_reason why a row closed without an answer on the page
--                    (answered elsewhere, PR merged, duplicate, note done)
--    No grant changes: the app's update grant stays on the answer columns.
--
-- 2. mission.decision_questions: "ask a question" on a card. The signed-in
--    owner inserts (decision_id, question) on his own decision; user_id comes
--    from auth.uid(). The box script delivers each as a `kind: question` note
--    to Chief of Staff and stamps delivered_at with the service role.

alter table mission.decisions
  add column if not exists pr_ref text,
  add column if not exists next_step text,
  add column if not exists dedupe_key text,
  add column if not exists closed_reason text;

create index if not exists decisions_user_dedupe_idx on mission.decisions (user_id, dedupe_key);

create table if not exists mission.decision_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  decision_id uuid not null references mission.decisions (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 1000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_ref text,
  delivery_error text
);

create index if not exists decision_questions_pending_idx
  on mission.decision_questions (user_id, created_at)
  where delivered_at is null;
create index if not exists decision_questions_decision_idx on mission.decision_questions (decision_id);

alter table mission.decision_questions enable row level security;

revoke all on mission.decision_questions from anon, authenticated;
grant select on mission.decision_questions to authenticated;
grant insert (decision_id, question) on mission.decision_questions to authenticated;

create policy decision_questions_owner_read on mission.decision_questions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only on his own decision, and only as a fresh, undelivered question.
create policy decision_questions_owner_ask on mission.decision_questions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and delivered_at is null
    and delivery_ref is null
    and exists (
      select 1 from mission.decisions d
      where d.id = decision_id and d.user_id = (select auth.uid())
    )
  );
