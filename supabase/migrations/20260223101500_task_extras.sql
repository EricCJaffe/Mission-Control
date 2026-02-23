create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null,
  title text not null,
  status text default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null,
  label text,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_note_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  org_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.task_subtasks enable row level security;
alter table public.task_links enable row level security;
alter table public.task_note_links enable row level security;

create policy "task_subtasks_select_own" on public.task_subtasks for select using (auth.uid() = org_id);
create policy "task_subtasks_insert_own" on public.task_subtasks for insert with check (auth.uid() = org_id);
create policy "task_subtasks_update_own" on public.task_subtasks for update using (auth.uid() = org_id);
create policy "task_subtasks_delete_own" on public.task_subtasks for delete using (auth.uid() = org_id);

create policy "task_links_select_own" on public.task_links for select using (auth.uid() = org_id);
create policy "task_links_insert_own" on public.task_links for insert with check (auth.uid() = org_id);
create policy "task_links_update_own" on public.task_links for update using (auth.uid() = org_id);
create policy "task_links_delete_own" on public.task_links for delete using (auth.uid() = org_id);

create policy "task_note_links_select_own" on public.task_note_links for select using (auth.uid() = org_id);
create policy "task_note_links_insert_own" on public.task_note_links for insert with check (auth.uid() = org_id);
create policy "task_note_links_update_own" on public.task_note_links for update using (auth.uid() = org_id);
create policy "task_note_links_delete_own" on public.task_note_links for delete using (auth.uid() = org_id);

create index if not exists task_subtasks_task_id_idx on public.task_subtasks (task_id);
create index if not exists task_links_task_id_idx on public.task_links (task_id);
create index if not exists task_note_links_task_id_idx on public.task_note_links (task_id);
create index if not exists task_note_links_note_id_idx on public.task_note_links (note_id);
