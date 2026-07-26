-- Knowledge base: a searchable, categorised personal KB on top of the existing
-- `notes` table. App-canonical (Supabase is the master copy); categories map to
-- a materialised folder path so a future one-way Obsidian export can drop each
-- note at Category/Subcategory/title.md unchanged.

-- ------------------------------------------------------------
-- Category tree (self-referencing). `path` is the materialised folder path,
-- e.g. "Health and Fitness/Weight Lifting" — kept denormalised so both
-- category-scoped queries and the Obsidian export are trivial.
-- ------------------------------------------------------------
create table if not exists public.note_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.note_categories(id) on delete cascade,
  path text not null,
  sort integer not null default 0,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists note_categories_user_idx on public.note_categories(user_id);
create index if not exists note_categories_parent_idx on public.note_categories(parent_id);
create unique index if not exists note_categories_user_path_idx on public.note_categories(user_id, path);

alter table public.note_categories enable row level security;
drop policy if exists "note_categories_owner" on public.note_categories;
create policy "note_categories_owner" on public.note_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Link notes to a category (+ denormalised path for display / export).
-- ------------------------------------------------------------
alter table public.notes
  add column if not exists category_id uuid references public.note_categories(id) on delete set null,
  add column if not exists category_path text;

create index if not exists notes_category_idx on public.notes(category_id);

-- ------------------------------------------------------------
-- Full-text search over title + markdown body. A stored generated tsvector
-- keeps it always-current with no trigger to maintain.
-- ------------------------------------------------------------
alter table public.notes
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_md, ''))
  ) stored;

create index if not exists notes_search_idx on public.notes using gin(search_tsv);

-- ------------------------------------------------------------
-- Seed a user's default category tree. Idempotent: only creates a category when
-- that (user, path) does not already exist, so it is safe to call on every KB
-- visit and never clobbers user edits. Returns how many it created.
-- ------------------------------------------------------------
create or replace function public.seed_default_note_categories(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer := 0;
  v_hf uuid;
  v_id uuid;
  rec record;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id does not match the authenticated user';
  end if;

  -- Top-level categories.
  for rec in
    select * from (values
      ('Mission Vision Values', 10, 'compass'),
      ('Health and Fitness',    20, 'heart-pulse'),
      ('Jiu Jitsu',             30, 'swords'),
      ('Shooting',              40, 'target')
    ) as t(name, sort, icon)
  loop
    select id into v_id from public.note_categories
      where user_id = p_user_id and path = rec.name;
    if v_id is null then
      insert into public.note_categories (user_id, name, parent_id, path, sort, icon)
      values (p_user_id, rec.name, null, rec.name, rec.sort, rec.icon)
      returning id into v_id;
      v_created := v_created + 1;
    end if;
    if rec.name = 'Health and Fitness' then
      v_hf := v_id;
    end if;
  end loop;

  -- Health and Fitness subcategories.
  for rec in
    select * from (values
      ('Weight Lifting',      10),
      ('Cardio',              20),
      ('Nutrition',           30),
      ('Mobility',            40),
      ('Breathing Exercises', 50)
    ) as t(name, sort)
  loop
    if not exists (
      select 1 from public.note_categories
      where user_id = p_user_id and path = 'Health and Fitness/' || rec.name
    ) then
      insert into public.note_categories (user_id, name, parent_id, path, sort)
      values (p_user_id, rec.name, v_hf, 'Health and Fitness/' || rec.name, rec.sort);
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

notify pgrst, 'reload schema';
