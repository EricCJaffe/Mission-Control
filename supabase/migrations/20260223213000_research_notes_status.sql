alter table public.research_notes
add column if not exists status text default 'inbox';

update public.research_notes
set status = 'inbox'
where status is null;

alter table public.research_notes
alter column status set not null;
