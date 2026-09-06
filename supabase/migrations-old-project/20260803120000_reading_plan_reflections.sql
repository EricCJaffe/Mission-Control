-- Reflections on a day's reading.
--
-- Stored as rows here AND mirrored into a single note per subscription, so
-- they're reachable from the notes side like any other writing rather than
-- being locked inside the reading module. Keeping the rows too means a
-- reflection stays attached to its specific day and plan run — which is what
-- makes it useful to compare against when the same plan is read again later.

create table if not exists public.reading_plan_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.reading_plan_subscriptions(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  /** Passage label the reflection was written against, denormalised so the
      note reads correctly even if a plan is later re-seeded. */
  passage_label text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, day_number)
);

create index if not exists reading_plan_reflections_user_idx
  on public.reading_plan_reflections (user_id, created_at desc);

alter table public.reading_plan_reflections enable row level security;
drop policy if exists "reading_plan_reflections_owner" on public.reading_plan_reflections;
create policy "reading_plan_reflections_owner" on public.reading_plan_reflections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One note per plan run, holding every reflection for it.
alter table public.reading_plan_subscriptions
  add column if not exists note_id uuid references public.notes(id) on delete set null;
