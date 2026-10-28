-- mission.bot_activity_decisions: Eric's answers on /activity, and their audit log.
--
-- Eric, 2026-10-27 7:53 PM ET (relayed by Chief of Staff): "Should the bot
-- activity be interactive whereby if there is a task waiting on me I can
-- update its status or something to get it moving forward? ... It looks like
-- a number of them are stalled on me."
--
-- One row per tap. The page writes it as the signed-in user; nothing else in
-- Vercel can (no service-role key, no GitHub token). The 5-minute harvester on
-- ubuntu-dev (scripts/sync/activity-deliver.ts) reads the undelivered rows,
-- writes each as a channel note to the bot that asked (his choice quoted, so
-- his own words count for hard-gate items), records drops in open/decisions.tsv
-- (R-163: dropped stays dropped), and stamps delivered_at.
--
--   item_key     mission.bot_activity_items.source_key, or task:<uuid> for a
--                Mission Control task. Rows survive the 7-day window, so a
--                dropped item stays dropped even after its row is replaced.
--   choice       approve | no | not_now | drop | reply   (bots waiting on you)
--                done | snooze | drop                    (your to-dos)
--   until_date   not_now / snooze: hidden until this ET day.
--   reply        his text, scrubbed of addresses/phones/ids before insert.
--
-- RLS: insert and select own rows only, and only undelivered rows can be
-- inserted. No update or delete policy: the audit log cannot be edited from
-- the app. delivered_at is set by the harvester's service-role client.
--
-- Additive only. Rollback: supabase/rollbacks/20261028000259_bot_activity_decisions.down.sql

create table if not exists mission.bot_activity_decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_key        text not null,
  item_source     text not null,
  -- What the item said when he answered, scrubbed: the audit log reads on
  -- its own after the item itself is gone.
  item_title      text not null,
  item_bot        text not null,
  choice          text not null,
  reply           text,
  until_date      date,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  delivery_ref    text,
  delivery_error  text,

  constraint bot_activity_decisions_source_check
    check (item_source in ('channel', 'loops', 'task')),
  constraint bot_activity_decisions_choice_check
    check (choice in ('approve', 'no', 'not_now', 'drop', 'reply', 'done', 'snooze')),
  -- Task choices only on tasks, bot choices only on bot items.
  constraint bot_activity_decisions_choice_source_check
    check (
      (item_source = 'task' and choice in ('done', 'snooze', 'drop'))
      or (item_source <> 'task' and choice in ('approve', 'no', 'not_now', 'drop', 'reply'))
    ),
  constraint bot_activity_decisions_until_check
    check ((choice in ('not_now', 'snooze')) = (until_date is not null)),
  constraint bot_activity_decisions_reply_check
    check ((choice <> 'reply' or reply is not null) and (reply is null or char_length(reply) between 1 and 1000)),
  constraint bot_activity_decisions_key_len check (char_length(item_key) between 1 and 200),
  constraint bot_activity_decisions_title_len check (char_length(item_title) between 1 and 200),
  constraint bot_activity_decisions_bot_len check (char_length(item_bot) between 1 and 60)
);

create index if not exists bot_activity_decisions_user_created_idx
  on mission.bot_activity_decisions (user_id, created_at desc);

create index if not exists bot_activity_decisions_undelivered_idx
  on mission.bot_activity_decisions (created_at)
  where delivered_at is null;

alter table mission.bot_activity_decisions enable row level security;

drop policy if exists bot_activity_decisions_owner_read on mission.bot_activity_decisions;
create policy bot_activity_decisions_owner_read on mission.bot_activity_decisions
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists bot_activity_decisions_owner_insert on mission.bot_activity_decisions;
create policy bot_activity_decisions_owner_insert on mission.bot_activity_decisions
  for insert
  with check (
    (select auth.uid()) = user_id
    and delivered_at is null
    and delivery_ref is null
    and delivery_error is null
  );
