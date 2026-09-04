create table if not exists public.prayer_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists prayer_categories_user_idx
  on public.prayer_categories (user_id, position);

alter table public.prayer_categories enable row level security;
drop policy if exists prayer_categories_owner on public.prayer_categories;
create policy prayer_categories_owner on public.prayer_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.prayer_subjects
  drop constraint if exists prayer_subjects_category_check;

insert into public.prayer_categories (user_id, key, label, position)
select u.user_id, c.key, c.label, c.position
from (select distinct user_id from public.prayer_subjects) u
cross join (values
  ('family',     'Family',                 0),
  ('friends',    'Friends',                1),
  ('church',     'The Church',             2),
  ('missions',   'Missions',               3),
  ('government', 'Government & Authority', 4),
  ('world',      'World Issues',           5),
  ('work',       'Work & Business',        6),
  ('finances',   'Finances',               7),
  ('self',       'Spirit, Soul & Body',    8),
  ('other',      'Other',                  9)
) as c(key, label, position)
on conflict (user_id, key) do nothing;

with ordered as (
  select
    id,
    row_number() over (
      partition by user_id, coalesce(parent_id::text, 'root:' || category)
      order by position, name
    ) * 10 as seq
  from public.prayer_subjects
)
update public.prayer_subjects s
set position = ordered.seq
from ordered
where s.id = ordered.id and s.position = 0;
