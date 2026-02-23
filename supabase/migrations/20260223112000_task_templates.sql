alter table public.tasks
add column if not exists is_template boolean default false;

create index if not exists tasks_is_template_idx on public.tasks (is_template);
