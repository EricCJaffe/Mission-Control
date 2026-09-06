create table if not exists public.chapter_proposals (
  id uuid default extensions.uuid_generate_v4() not null,
  chapter_id uuid not null,
  org_id uuid not null,
  instruction text,
  proposed_markdown text not null,
  status text default 'pending',
  created_at timestamptz default now(),
  constraint chapter_proposals_pkey primary key (id),
  constraint chapter_proposals_chapter_id_fkey foreign key (chapter_id) references public.chapters(id) on delete cascade,
  constraint chapter_proposals_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create index if not exists chapter_proposals_chapter_id_idx on public.chapter_proposals(chapter_id);

alter table public.chapter_proposals enable row level security;

create policy "chapter_proposals_owner" on public.chapter_proposals
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);
