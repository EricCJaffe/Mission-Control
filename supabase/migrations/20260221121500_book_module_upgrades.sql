-- Book module upgrades: statuses, sections, tasks links, uploads, comments

alter table public.books
  add column if not exists status text default 'planning',
  add column if not exists target_word_count integer default 50000;

alter table public.chapters
  add column if not exists word_count integer default 0,
  add column if not exists section_id uuid;

create table if not exists public.chapter_sections (
  id uuid default extensions.uuid_generate_v4() not null,
  book_id uuid not null,
  org_id uuid not null,
  title text not null,
  position integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chapter_sections_pkey primary key (id),
  constraint chapter_sections_book_id_fkey foreign key (book_id) references public.books(id) on delete cascade,
  constraint chapter_sections_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

alter table public.chapters
  add constraint chapters_section_id_fkey foreign key (section_id) references public.chapter_sections(id) on delete set null;

alter table public.tasks
  add column if not exists book_id uuid,
  add column if not exists chapter_id uuid;

alter table public.tasks
  add constraint tasks_book_id_fkey foreign key (book_id) references public.books(id) on delete set null;

alter table public.tasks
  add constraint tasks_chapter_id_fkey foreign key (chapter_id) references public.chapters(id) on delete set null;

create table if not exists public.chapter_comments (
  id uuid default extensions.uuid_generate_v4() not null,
  chapter_id uuid not null,
  org_id uuid not null,
  anchor_text text,
  start_offset integer,
  end_offset integer,
  comment text not null,
  suggested_patch text,
  status text default 'open',
  created_by uuid not null,
  created_at timestamptz default now(),
  constraint chapter_comments_pkey primary key (id),
  constraint chapter_comments_chapter_id_fkey foreign key (chapter_id) references public.chapters(id) on delete cascade,
  constraint chapter_comments_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade,
  constraint chapter_comments_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade
);

create table if not exists public.book_uploads (
  id uuid default extensions.uuid_generate_v4() not null,
  book_id uuid not null,
  org_id uuid not null,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now(),
  constraint book_uploads_pkey primary key (id),
  constraint book_uploads_book_id_fkey foreign key (book_id) references public.books(id) on delete cascade,
  constraint book_uploads_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.book_milestones (
  id uuid default extensions.uuid_generate_v4() not null,
  book_id uuid not null,
  org_id uuid not null,
  title text not null,
  due_date date,
  status text default 'planned',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint book_milestones_pkey primary key (id),
  constraint book_milestones_book_id_fkey foreign key (book_id) references public.books(id) on delete cascade,
  constraint book_milestones_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create index if not exists chapter_sections_book_id_idx on public.chapter_sections(book_id);
create index if not exists chapter_sections_position_idx on public.chapter_sections(position);
create index if not exists chapters_section_id_idx on public.chapters(section_id);
create index if not exists tasks_book_id_idx on public.tasks(book_id);
create index if not exists tasks_chapter_id_idx on public.tasks(chapter_id);
create index if not exists chapter_comments_chapter_id_idx on public.chapter_comments(chapter_id);
create index if not exists book_uploads_book_id_idx on public.book_uploads(book_id);
create index if not exists book_milestones_book_id_idx on public.book_milestones(book_id);

alter table public.chapter_sections enable row level security;
alter table public.chapter_comments enable row level security;
alter table public.book_uploads enable row level security;
alter table public.book_milestones enable row level security;

create policy "chapter_sections_owner" on public.chapter_sections
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chapter_comments_owner" on public.chapter_comments
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "book_uploads_owner" on public.book_uploads
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "book_milestones_owner" on public.book_milestones
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

-- Storage bucket for originals
insert into storage.buckets (id, name, public)
values ('book_uploads', 'book_uploads', false)
on conflict (id) do nothing;

-- Storage object policies: user scoped by path prefix {userId}/...
create policy "book_uploads_storage_owner"
  on storage.objects
  for all
  using (
    bucket_id = 'book_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'book_uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
