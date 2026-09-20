-- A sermon can stand on its own.
--
-- Eric, 2026-09-19: *"I thought it was going to get synced into Mission Control
-- under sermons — we need a standalone category rather than just a series
-- function. But that area is blank."*
--
-- Both halves of that are true and they are separate problems.
--
-- ⚠️ IT IS BLANK BECAUSE NOTHING WAS EVER LOADED. `mission.sermons` holds 0
-- rows and `mission.sermon_series` holds 0. The manuscript for 20 November was
-- written into `~/dev/brain/sermons/` and offered for loading; the go-ahead was
-- asked for and the thread moved on, so it never arrived. That is not a bug,
-- it is a thing left undone, and it is fixed by loading it.
--
-- ⚠️ BUT A STANDALONE SERMON WAS ALSO IMPOSSIBLE, at three layers:
--
--   1. `sermons.series_id` is NOT NULL — the row could not exist
--   2. `/sermons` lists `sermon_series` only, so it would not appear
--   3. `/sermons/sermon/new` requires a `series_id` from the form
--
-- So the module is a *series* module with sermons inside it, which is right for
-- how he used to preach and wrong for how he preaches now. He said it himself
-- earlier today, answering the preaching-brain questions: *"I don't preach as
-- many series as I used to, I will probably do more standalones."*
--
-- This migration does the first layer. The other two are in the same commit.

alter table mission.sermons
  alter column series_id drop not null;

comment on column mission.sermons.series_id is
  'NULL means a standalone sermon -- one that belongs to no series. That is now '
  'the common case rather than the exception: Eric preaches more standalones '
  'than series. A series is a grouping a sermon may have, not a parent it must '
  'have.';

-- Ordering inside a series is what `position` is for, and it has no meaning
-- without one. Left alone deliberately: a standalone sermon simply has no
-- position, and the list orders standalones by preach_date instead.

-- ⚠️ The unique index that kept two sermons from sharing a position within a
-- series must not start treating all standalones as one series. Postgres
-- already does the right thing here -- NULL is never equal to NULL, so rows
-- with a null series_id never collide -- but it is worth saying, because the
-- obvious "fix" of COALESCE(series_id, '...') would create exactly that bug.
