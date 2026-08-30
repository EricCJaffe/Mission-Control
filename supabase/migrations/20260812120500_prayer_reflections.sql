-- Reflections: a note about a prayer, on a date, that is not "I prayed this".
--
-- prayer_logs already had a `note` column and the API already accepted one, but
-- the only thing that ever wrote a row was the checkmark — so the only way to
-- record a thought about a prayer was to close it out for the day. That is
-- backwards. The thing worth keeping about praying for your father for three
-- years is not thirty-six checkmarks, it is the handful of times you wrote
-- down what was actually happening.
--
-- Splitting the two apart is one column. `kind = 'prayed'` is the checkmark;
-- `kind = 'note'` is a reflection that leaves the rotation alone — it does not
-- move last_prayed_at, does not count towards prayed_count, and does not take
-- the item off today's list. You can write about something you are still
-- carrying without the app deciding you are finished with it today.
--
-- Both kinds share one table so the history reads as a single timeline in date
-- order, which is how it will be reread.

alter table public.prayer_logs
  add column if not exists kind text not null default 'prayed'
    check (kind in ('prayed', 'note')),
  -- Notes get edited; a checkmark does not. Worth knowing which is which when
  -- looking back at something written a year ago.
  add column if not exists updated_at timestamptz not null default now();

comment on column public.prayer_logs.kind is
  'prayed = the checkmark, advances the rotation. note = a dated reflection, leaves the rotation untouched.';

-- Every existing row came from the checkmark or the last_prayed_at backfill,
-- so the default is already correct for all of them; stated here so the intent
-- survives a reader who arrives at this table without the migration history.
update public.prayer_logs set kind = 'prayed' where kind is null;

-- The history panel reads one request's timeline newest-first, and the request
-- card needs "does this have any reflections" without pulling the rows.
create index if not exists prayer_logs_request_kind_idx
  on public.prayer_logs (request_id, kind, prayed_at desc);
