-- Practice tracking: the outward, observable side of the Spirit pillar.
--
-- The survey asks how your faith life FEELS. These record what actually
-- happened — read, prayed, gave, gathered — so the two can be compared. They
-- are deliberately kept as separate signals rather than averaged: the useful
-- moment is when they disagree.
--
-- Supersedes the hardcoded booleans on daily_anchors (prayer/training/
-- family_touchpoint), which couldn't grow past three fixed practices. Existing
-- prayer check-ins are migrated below; daily_anchors itself is left in place.

create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /** Stable slug used in code — label is free to change. */
  key text not null,
  label text not null,
  description text,
  pillar text not null default 'spirit' check (pillar in ('spirit', 'soul', 'body')),
  /** Drives how adherence is measured — a weekly practice can't share a
      daily streak calculation. */
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly', 'monthly')),
  /** Completions expected per period, e.g. small group 1x/week. */
  target_per_period integer not null default 1 check (target_per_period > 0),
  /** Lucide icon name, resolved client-side. */
  icon text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists practices_user_active_idx
  on public.practices (user_id, active, sort_order);

alter table public.practices enable row level security;
drop policy if exists "practices_owner" on public.practices;
create policy "practices_owner" on public.practices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.practice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  /** Optional magnitude — minutes read, amount given. */
  value numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One entry per practice per day; toggling updates rather than stacking.
  unique (user_id, practice_id, log_date)
);

create index if not exists practice_logs_user_date_idx
  on public.practice_logs (user_id, log_date desc);

alter table public.practice_logs enable row level security;
drop policy if exists "practice_logs_owner" on public.practice_logs;
create policy "practice_logs_owner" on public.practice_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ——— Seed a starting set for every existing user ———
-- Outward indicators of a faith life, at the cadence each naturally happens.
insert into public.practices (user_id, key, label, description, pillar, cadence, target_per_period, icon, sort_order)
select
  u.id, p.key, p.label, p.description, 'spirit', p.cadence, p.target_per_period, p.icon, p.sort_order
from auth.users u
cross join (values
  ('bible_reading', 'Bible reading',   'Time in Scripture today',                'daily',   1, 'BookOpen',   10),
  ('prayer',        'Prayer',          'Intentional time in prayer',             'daily',   1, 'HandHeart',  20),
  ('faith_reading', 'Faith reading',   'Book, devotional or study material',     'daily',   1, 'Library',    30),
  ('church',        'Church',          'Corporate worship',                      'weekly',  1, 'Church',     40),
  ('small_group',   'Small group',     'Gathering with your people',             'weekly',  1, 'Users',      50),
  ('giving',        'Giving',          'Regular, planned generosity',            'monthly', 1, 'HandCoins',  60)
) as p(key, label, description, cadence, target_per_period, icon, sort_order)
on conflict (user_id, key) do nothing;

-- Bring forward prayer check-ins already recorded on daily_anchors so the
-- streak doesn't restart at zero.
insert into public.practice_logs (user_id, practice_id, log_date, completed)
select a.user_id, pr.id, a.date, true
from public.daily_anchors a
join public.practices pr on pr.user_id = a.user_id and pr.key = 'prayer'
where a.prayer is true
on conflict (user_id, practice_id, log_date) do nothing;
