-- Ultimate Book Writer module

create extension if not exists vector;

create table if not exists public.books (
  id uuid default extensions.uuid_generate_v4() not null,
  org_id uuid not null,
  title text not null,
  description text,
  created_by uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint books_pkey primary key (id),
  constraint books_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade,
  constraint books_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade
);

create table if not exists public.chapters (
  id uuid default extensions.uuid_generate_v4() not null,
  book_id uuid not null,
  org_id uuid not null,
  title text not null,
  slug text not null,
  position integer default 0,
  status text default 'outline',
  summary text,
  markdown_current text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chapters_pkey primary key (id),
  constraint chapters_book_id_fkey foreign key (book_id) references public.books(id) on delete cascade,
  constraint chapters_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.chapter_versions (
  id uuid default extensions.uuid_generate_v4() not null,
  chapter_id uuid not null,
  org_id uuid not null,
  version_number integer not null,
  markdown text not null,
  created_by uuid not null,
  created_at timestamptz default now(),
  constraint chapter_versions_pkey primary key (id),
  constraint chapter_versions_chapter_id_fkey foreign key (chapter_id) references public.chapters(id) on delete cascade,
  constraint chapter_versions_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade,
  constraint chapter_versions_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade
);

create table if not exists public.research_notes (
  id uuid default extensions.uuid_generate_v4() not null,
  scope_type text not null,
  scope_id uuid not null,
  org_id uuid not null,
  title text not null,
  content_md text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint research_notes_pkey primary key (id),
  constraint research_notes_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.chat_threads (
  id uuid default extensions.uuid_generate_v4() not null,
  scope_type text not null,
  scope_id uuid not null,
  org_id uuid not null,
  created_by uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chat_threads_pkey primary key (id),
  constraint chat_threads_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade,
  constraint chat_threads_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade
);

create table if not exists public.chat_messages (
  id uuid default extensions.uuid_generate_v4() not null,
  thread_id uuid not null,
  org_id uuid not null,
  role text not null,
  content text not null,
  tool_calls_json jsonb,
  created_at timestamptz default now(),
  constraint chat_messages_pkey primary key (id),
  constraint chat_messages_thread_id_fkey foreign key (thread_id) references public.chat_threads(id) on delete cascade,
  constraint chat_messages_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.chapter_chunks (
  id uuid default extensions.uuid_generate_v4() not null,
  chapter_id uuid not null,
  org_id uuid not null,
  chunk_index integer not null,
  heading_path text,
  content text not null,
  token_count integer,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now(),
  constraint chapter_chunks_pkey primary key (id),
  constraint chapter_chunks_chapter_id_fkey foreign key (chapter_id) references public.chapters(id) on delete cascade,
  constraint chapter_chunks_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.persona_profiles (
  id uuid default extensions.uuid_generate_v4() not null,
  org_id uuid not null,
  title text not null,
  voice_style text,
  tone text,
  audience text,
  theological_guardrails text,
  mission_alignment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint persona_profiles_pkey primary key (id),
  constraint persona_profiles_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create index if not exists chapters_book_id_idx on public.chapters(book_id);
create index if not exists chapters_position_idx on public.chapters(position);
create index if not exists chapters_status_idx on public.chapters(status);
create index if not exists chapter_versions_chapter_id_idx on public.chapter_versions(chapter_id);
create index if not exists research_notes_scope_idx on public.research_notes(scope_type, scope_id);
create index if not exists chat_threads_scope_idx on public.chat_threads(scope_type, scope_id);
create index if not exists chat_messages_thread_idx on public.chat_messages(thread_id);
create index if not exists chapter_chunks_chapter_id_idx on public.chapter_chunks(chapter_id);

alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_versions enable row level security;
alter table public.research_notes enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chapter_chunks enable row level security;
alter table public.persona_profiles enable row level security;

create policy "books_owner" on public.books
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chapters_owner" on public.chapters
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chapter_versions_owner" on public.chapter_versions
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "research_notes_owner" on public.research_notes
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chat_threads_owner" on public.chat_threads
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chat_messages_owner" on public.chat_messages
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "chapter_chunks_owner" on public.chapter_chunks
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "persona_profiles_owner" on public.persona_profiles
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);
