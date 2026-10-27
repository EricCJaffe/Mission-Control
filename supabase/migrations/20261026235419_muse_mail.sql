-- mission.muse_mail: a mailbox for Muse Code, the terminal agent on Eric's Mac.
--
-- Eric, 2026-10-26 7:50 PM ET (relayed by Chief of Staff): Muse Code gets a
-- mailbox in Mission Control instead of an /api/mcp server. The bots post an
-- ask (/api/cron/muse-outbox/ask, Bearer CRON_SECRET); Muse reads, takes and
-- answers it (/api/muse/inbox, Bearer MUSE_MAILBOX_TOKEN, checked against a
-- sha256 in Vercel env); a brain-side pull on ubuntu-dev collects the answered
-- rows (/api/cron/muse-outbox) and acks each one with handed_off_at once its
-- to-grokbot note is committed, the same never-drop shape as the brief outbox.
--
-- The Muse token reaches this table and nothing else: the routes go through a
-- fixed query module (src/lib/muse/mail.ts) with the table name as a constant.
--
-- Lifecycle: new -> taken -> done, then handed_off_at once delivered. A done
-- row with handed_off_at null is a reply nobody has seen yet; never delete one
-- to tidy up.
--
-- Additive only: no existing table, policy or function changes.
-- Rollback: supabase/rollbacks/20261026235419_muse_mail.down.sql

create table if not exists mission.muse_mail (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_agent     text not null,
  ask            text not null,
  status         text not null default 'new',
  reply          text,
  created_at     timestamptz not null default now(),
  taken_at       timestamptz,
  done_at        timestamptz,
  handed_off_at  timestamptz,
  handoff_ref    text,
  constraint muse_mail_status_check check (status in ('new', 'taken', 'done')),
  constraint muse_mail_from_agent_check check (from_agent ~ '^[a-z0-9_-]{1,40}$'),
  constraint muse_mail_ask_len check (char_length(ask) between 1 and 20000),
  constraint muse_mail_reply_len check (reply is null or char_length(reply) <= 20000)
);

create index if not exists muse_mail_user_status_created_idx
  on mission.muse_mail (user_id, status, created_at);

alter table mission.muse_mail enable row level security;

-- Owner policy so a signed-in page can show the mailbox later. The API routes
-- use the service role (no session) and scope every query to MC_USER_ID.
drop policy if exists muse_mail_owner on mission.muse_mail;
create policy muse_mail_owner on mission.muse_mail
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
