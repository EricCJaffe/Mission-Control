-- Seed soul note scaffold for Eric Jaffe if the user exists.
with target_user as (
  select id from auth.users where email = 'ejaffejax@gmail.com'
)
, purge as (
  delete from public.notes
  where user_id in (select id from target_user) and title = 'soul'
)
insert into public.notes (user_id, title, content_md, tags)
select id,
       'soul',
       $$# Soul

## Alignment
- What restores you?
- What drains you?

## Relationships
- People to invest in
- People to ask for help

## Emotional Weather
- What are you feeling today?
- What needs prayer or attention?
$$,
       array['knowledge','soul']
from target_user;
