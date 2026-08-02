-- Bible reading plans.
--
-- Plans store passage REFERENCES only (USFM, e.g. 'GEN.1-GEN.3'), never text.
-- Scripture text is fetched at render time from API.Bible under Eric's key, so
-- a licence change or a pulled key degrades the page to references-plus-link
-- rather than breaking the feature. It also keeps copyrighted text out of this
-- database entirely.

create table if not exists public.reading_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text not null default 'topical'
    check (category in ('whole_bible', 'testament', 'book', 'topical', 'custom')),
  day_count integer not null check (day_count > 0),
  /** Null for seeded plans available to everyone. */
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reading_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.reading_plans(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  /** USFM references for the day, in reading order. */
  passages text[] not null,
  /** Pre-rendered human label, so listing a plan needs no lookup table. */
  label text not null,
  unique (plan_id, day_number)
);

create index if not exists reading_plan_days_plan_idx
  on public.reading_plan_days (plan_id, day_number);

create table if not exists public.reading_plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.reading_plans(id) on delete cascade,
  started_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active run of a given plan at a time; finished ones stay as history.
create unique index if not exists reading_plan_subscriptions_active_idx
  on public.reading_plan_subscriptions (user_id, plan_id)
  where status = 'active';

create table if not exists public.reading_plan_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.reading_plan_subscriptions(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (subscription_id, day_number)
);

create index if not exists reading_plan_progress_user_idx
  on public.reading_plan_progress (user_id, completed_on desc);

-- ——— RLS ———
-- Plans are readable by everyone (seeded ones have no owner); user-authored
-- plans are private to their author. Progress is always private.
alter table public.reading_plans enable row level security;
drop policy if exists "reading_plans_read" on public.reading_plans;
create policy "reading_plans_read" on public.reading_plans
  for select using (created_by is null or auth.uid() = created_by);
drop policy if exists "reading_plans_write" on public.reading_plans;
create policy "reading_plans_write" on public.reading_plans
  for all using (auth.uid() = created_by) with check (auth.uid() = created_by);

alter table public.reading_plan_days enable row level security;
drop policy if exists "reading_plan_days_read" on public.reading_plan_days;
create policy "reading_plan_days_read" on public.reading_plan_days
  for select using (
    exists (
      select 1 from public.reading_plans p
      where p.id = plan_id and (p.created_by is null or p.created_by = auth.uid())
    )
  );

alter table public.reading_plan_subscriptions enable row level security;
drop policy if exists "reading_plan_subscriptions_owner" on public.reading_plan_subscriptions;
create policy "reading_plan_subscriptions_owner" on public.reading_plan_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.reading_plan_progress enable row level security;
drop policy if exists "reading_plan_progress_owner" on public.reading_plan_progress;
create policy "reading_plan_progress_owner" on public.reading_plan_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
