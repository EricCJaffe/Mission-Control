-- An idea can carry a link and a picture, because most of them arrive that way.
--
-- Eric, 2026-09-19: "one update to the /idea feature we need to add attachments
-- and links. For instance here is a great idea /idea improve our calendar UI in
-- the OS apps to look more like the attached image."
--
-- That sentence is the whole argument. The idea WAS the image. Caught as one
-- line of text it becomes "improve our calendar UI", which six weeks later is a
-- note nobody can act on, because the thing that made it worth catching -- what
-- "better" actually looked like -- was in the attachment.
--
-- ⚠️ TWO COLUMNS, NOT ONE, BECAUSE THEY ARE NOT THE SAME THING. A link points
-- at something that lives elsewhere and keeps changing; an attachment is a copy
-- of something at the moment it was caught. A screenshot of a competitor's UI
-- is worthless as a link -- the page will have been redesigned by the time it
-- matters -- and a Figma file is worthless as a copy.
--
-- ⚠️ `links` IS A PLAIN text[] AND NOT A TABLE. It follows `promote_tasks`:
-- short strings with no identity of their own, edited only as a whole, never
-- joined against. A table would buy ordering and titles and cost a join on
-- every board render.

alter table mission.ideas
  add column if not exists links text[] not null default '{}';

comment on column mission.ideas.links is
  'Pointers to things that live elsewhere and keep changing. An attachment is the opposite: a copy of something as it was when the idea was caught.';

create table if not exists mission.idea_attachments (
  id       uuid primary key default gen_random_uuid(),
  idea_id  uuid not null references mission.ideas(id) on delete cascade,
  user_id  uuid not null references auth.users(id)    on delete cascade,
  bucket   text not null default 'attachments',
  path     text not null,
  filename text not null,
  mime     text,
  bytes    bigint,
  created_at timestamptz not null default now(),
  constraint idea_attachments_path_key unique (bucket, path),
  constraint idea_attachments_bytes_check check (bytes is null or bytes >= 0)
);

create index if not exists idea_attachments_idea_idx
  on mission.idea_attachments (idea_id, created_at);

-- ⚠️ THE CASCADE REMOVES THE ROW AND NOT THE BYTES. Deleting an idea drops its
-- attachment rows and leaves the objects in storage, orphaned and paid for.
-- Postgres cannot reach the storage API from a trigger, so the honest options
-- are a sweeper or deleting the object before the row. Neither is built; said
-- here so the next person finds it written down rather than in a bill. Ideas
-- are rarely deleted -- `killed` is a status, not a DELETE -- so this is a slow
-- leak, not a bug.

alter table mission.idea_attachments enable row level security;

drop policy if exists idea_attachments_owner on mission.idea_attachments;
create policy idea_attachments_owner on mission.idea_attachments
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on mission.idea_attachments from public;
revoke all on mission.idea_attachments from anon;
revoke all on mission.idea_attachments from authenticated;
grant select, insert, update, delete on mission.idea_attachments to authenticated;

notify pgrst, 'reload schema';
