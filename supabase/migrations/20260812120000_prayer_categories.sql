-- Prayer categories become data instead of a CHECK constraint.
--
-- The original ten headings came straight out of Eric's 2025 journal, and as a
-- starting point they were right. But they were encoded as a CHECK constraint
-- on prayer_subjects.category, which means the only way to rename "Government
-- & Authority", split "Friends" into neighbours and colleagues, or retire a
-- heading that stopped earning its place is a migration. A prayer list is a
-- living document — the headings are exactly the part that drifts as life
-- changes — so the taxonomy has to be editable from inside the app.
--
-- The key stays a text slug rather than becoming a foreign key to a uuid.
-- Three reasons: the ten existing values are already written into 120-odd
-- subject rows, the seeded journal import references them by name, and a
-- category that has been deleted should leave its subjects readable under
-- their old slug rather than nulling them out of existence. Referential
-- integrity here would be bought at the price of losing people off the list,
-- which is the one failure this module is built to prevent.

create table if not exists public.prayer_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Stable slug stored on prayer_subjects.category. Renaming the label does
  -- not touch it, so a rename cannot orphan a single subject.
  key text not null,
  label text not null,
  -- Display order of the headings themselves.
  position integer not null default 0,
  -- Retired rather than deleted: the heading stops being offered for new
  -- subjects but anything already filed under it still renders.
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

-- The constraint has to go before a user-defined key can be stored. The column
-- keeps its default so existing inserts that omit it still land in 'other'.
alter table public.prayer_subjects
  drop constraint if exists prayer_subjects_category_check;

-- Seed the journal's own ten headings for anyone who already has a prayer
-- list, in the order they appear in it. Only for users who have actually used
-- the module — seeding every account with a taxonomy it never asked for is
-- noise.
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

-- Subject ordering was never written. `position` defaults to 0 on every row,
-- so the tree fell back to alphabetical and drag-and-drop had nothing to
-- persist into. Give each sibling group a real starting order — the current
-- on-screen order, which is name-alphabetical within a parent — so the first
-- drag moves things relative to what the user is actually looking at.
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
