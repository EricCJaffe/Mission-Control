alter table public.notes
  add column if not exists status text default 'inbox';

create index if not exists notes_status_idx on public.notes(status);
