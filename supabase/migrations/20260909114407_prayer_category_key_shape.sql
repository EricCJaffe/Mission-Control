-- mission.prayer_categories has existed since 2026-08-12 (see
-- supabase/migrations-old-project/20260812134856_prayer_categories.sql) but
-- nothing has ever written to it: the app still reads a hardcoded
-- CATEGORY_LABELS map. The UI is about to let categories be created, renamed
-- and archived, which makes `key` user-supplied for the first time.
--
-- `key` is not decoration. It is the value written into
-- prayer_subjects.category, which is free text with no constraint of its own,
-- and it goes into URLs and React keys. A label of "Work & Business!" must not
-- become that string verbatim. The app slugifies, and this makes the database
-- refuse anything that got past it.

alter table mission.prayer_categories
  drop constraint if exists prayer_categories_key_shape;

alter table mission.prayer_categories
  add constraint prayer_categories_key_shape
  check (key ~ '^[a-z0-9][a-z0-9_-]*$');
