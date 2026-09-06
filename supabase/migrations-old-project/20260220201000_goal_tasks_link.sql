-- Link goals to tasks

create table if not exists public.goal_tasks (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  goal_id uuid not null,
  task_id uuid not null,
  created_at timestamptz default now(),
  constraint goal_tasks_pkey primary key (id),
  constraint goal_tasks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint goal_tasks_goal_id_fkey foreign key (goal_id) references public.goals(id) on delete cascade,
  constraint goal_tasks_task_id_fkey foreign key (task_id) references public.tasks(id) on delete cascade,
  constraint goal_tasks_unique unique (goal_id, task_id)
);

alter table public.goal_tasks enable row level security;

create policy "goal_tasks_owner" on public.goal_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
