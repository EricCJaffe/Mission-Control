-- 12-week cycles, goals, and SOP checklists

create table if not exists public.goal_cycles (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  review_week_start date,
  review_week_end date,
  notes_md text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint goal_cycles_pkey primary key (id),
  constraint goal_cycles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.goals (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  cycle_id uuid,
  domain text not null,
  title text not null,
  description_md text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint goals_pkey primary key (id),
  constraint goals_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint goals_cycle_id_fkey foreign key (cycle_id) references public.goal_cycles(id) on delete set null
);

create table if not exists public.sop_docs (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  title text not null,
  content_md text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sop_docs_pkey primary key (id),
  constraint sop_docs_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.sop_checks (
  id uuid default extensions.uuid_generate_v4() not null,
  sop_id uuid not null,
  user_id uuid not null,
  step text not null,
  is_done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sop_checks_pkey primary key (id),
  constraint sop_checks_sop_id_fkey foreign key (sop_id) references public.sop_docs(id) on delete cascade,
  constraint sop_checks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

alter table public.goal_cycles enable row level security;
alter table public.goals enable row level security;
alter table public.sop_docs enable row level security;
alter table public.sop_checks enable row level security;

create policy "goal_cycles_owner" on public.goal_cycles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals_owner" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sop_docs_owner" on public.sop_docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sop_checks_owner" on public.sop_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
