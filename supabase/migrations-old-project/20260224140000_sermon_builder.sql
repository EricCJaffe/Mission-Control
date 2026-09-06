create table if not exists public.sermon_series (
  id uuid default extensions.uuid_generate_v4() not null,
  org_id uuid not null,
  title text not null,
  subtitle text,
  description text,
  status text default 'planning',
  theme text,
  cadence text,
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sermon_series_pkey primary key (id),
  constraint sermon_series_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.sermons (
  id uuid default extensions.uuid_generate_v4() not null,
  series_id uuid not null,
  org_id uuid not null,
  title text not null,
  status text default 'outline',
  preach_date date,
  key_text text,
  big_idea text,
  outline_md text,
  manuscript_md text,
  notes_md text,
  position integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sermons_pkey primary key (id),
  constraint sermons_series_id_fkey foreign key (series_id) references public.sermon_series(id) on delete cascade,
  constraint sermons_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create table if not exists public.sermon_assets (
  id uuid default extensions.uuid_generate_v4() not null,
  org_id uuid not null,
  scope_type text not null,
  scope_id uuid not null,
  asset_type text not null,
  content_md text not null,
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sermon_assets_pkey primary key (id),
  constraint sermon_assets_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create index if not exists sermon_series_org_id_idx on public.sermon_series(org_id);
create index if not exists sermons_series_id_idx on public.sermons(series_id);
create index if not exists sermons_position_idx on public.sermons(position);
create index if not exists sermon_assets_scope_idx on public.sermon_assets(scope_type, scope_id);

alter table public.sermon_series enable row level security;
alter table public.sermons enable row level security;
alter table public.sermon_assets enable row level security;

create policy "sermon_series_owner" on public.sermon_series
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "sermons_owner" on public.sermons
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

create policy "sermon_assets_owner" on public.sermon_assets
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);
