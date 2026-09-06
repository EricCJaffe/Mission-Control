-- Feature Set 1: Home dashboard tables

create table if not exists public.daily_priorities (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  date date not null,
  rank integer not null,
  domain text not null,
  title text not null,
  task_id uuid,
  created_at timestamptz default now(),
  constraint daily_priorities_pkey primary key (id),
  constraint daily_priorities_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint daily_priorities_task_id_fkey foreign key (task_id) references public.tasks(id) on delete set null,
  constraint daily_priorities_unique unique (user_id, date, rank)
);

create table if not exists public.daily_anchors (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  date date not null,
  prayer boolean default false,
  training boolean default false,
  family_touchpoint boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint daily_anchors_pkey primary key (id),
  constraint daily_anchors_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint daily_anchors_unique unique (user_id, date)
);

create table if not exists public.calendar_events (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  event_type text not null,
  domain text,
  notes text,
  created_at timestamptz default now(),
  constraint calendar_events_pkey primary key (id),
  constraint calendar_events_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.monthly_reviews (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  period_start date not null,
  period_end date not null,
  alignment_score integer,
  alignment_status text,
  drift_flags text[],
  survey jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint monthly_reviews_pkey primary key (id),
  constraint monthly_reviews_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint monthly_reviews_unique unique (user_id, period_start)
);

alter table public.daily_priorities enable row level security;
alter table public.daily_anchors enable row level security;
alter table public.calendar_events enable row level security;
alter table public.monthly_reviews enable row level security;

create policy "daily_priorities_owner" on public.daily_priorities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_anchors_owner" on public.daily_anchors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "calendar_events_owner" on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "monthly_reviews_owner" on public.monthly_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
