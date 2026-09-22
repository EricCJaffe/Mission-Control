-- Promoting an idea into fsaos, from the board.
--
-- Eric, 2026-09-19: "Mission Control promote should offer an opportunity to
-- promote to FSAOS."
--
-- WHY A REQUEST AND NOT A DIRECT WRITE
--
-- `mission.promote_idea` makes the project here, in one transaction, because
-- both tables are in this database. fsaos is a DIFFERENT Supabase project
-- (ckqkfiqsobpnfbvjeqvy) and this app runs on Vercel, so there are exactly two
-- ways to reach it: put fsaos service-role credentials into Mission Control's
-- environment, or record the intent and let something that already holds them
-- act on it.
--
-- The second, for three reasons. Mission Control is Eric's personal app and
-- fsaos is the business's database, with four users and 2,000 tasks; a
-- service-role key bypasses RLS entirely, so that key in this app's env makes
-- every row in the business readable and writable from a personal deployment.
-- The box already has the credential and the logic -- `mc-idea --promote --to
-- fsaos` -- so a direct write here would be a second implementation of a thing
-- that exists. And it is the pattern fsaos itself uses for Asana
-- (`asana_outbox`, drained every 15 minutes), so it is not a new idea on this
-- estate.
--
-- The cost is honest and small: the project appears within a few minutes
-- rather than instantly, and the board says so while it waits.
--
-- ⚠️ `promote_request` IS NOT A STATUS. The idea stays `open` while it is
-- queued. Status is what happened; this is what was asked for and has not
-- happened yet. Folding it into status would mean a 'promoting' value that
-- every reader of the board -- the page, the weekly brief, `mc-idea --list` --
-- would have to learn, to describe a state that lasts ninety seconds.

alter table mission.ideas
  add column if not exists promote_request      text,
  add column if not exists promote_requested_at timestamptz,
  -- The first tasks, as typed on the board. Carried rather than created,
  -- because the project they belong to does not exist yet.
  add column if not exists promote_tasks        text[] not null default '{}',
  -- Why the last attempt failed, shown on the card. A queue that fails
  -- silently is a queue that looks like it is still working.
  add column if not exists promote_error        text;

-- fsaos only. Mission Control is not a value here: promoting to this database
-- is `mission.promote_idea`, which is synchronous and needs no queue.
alter table mission.ideas drop constraint if exists ideas_promote_request_check;
alter table mission.ideas add constraint ideas_promote_request_check
  check (promote_request is null or promote_request = 'fsaos');

-- The two move together or the queue cannot age its own rows.
alter table mission.ideas drop constraint if exists ideas_promote_requested_at_check;
alter table mission.ideas add constraint ideas_promote_requested_at_check
  check ((promote_request is null) = (promote_requested_at is null));

-- ⚠️ A REQUEST MAY NOT SURVIVE THE PROMOTION IT ASKED FOR. Without this, a
-- drain that sets status='promoted' and forgets to clear the request leaves a
-- row the next drain picks up again -- and `mc-idea --promote` is idempotent,
-- so it would succeed, print the same link, and hide the bug forever.
alter table mission.ideas drop constraint if exists ideas_promote_request_open_check;
alter table mission.ideas add constraint ideas_promote_request_open_check
  check (promote_request is null or status = 'open');

-- The drain's own query: the oldest request first, and nothing else scanned.
create index if not exists ideas_promote_queue_idx
  on mission.ideas (promote_requested_at asc)
  where promote_request is not null;

comment on column mission.ideas.promote_request is
  'Set to ''fsaos'' by the board to ask the box to create the project there. Cleared when it is done; see mc-idea --drain.';

notify pgrst, 'reload schema';
