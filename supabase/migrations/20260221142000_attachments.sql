create table if not exists public.attachments (
  id uuid default extensions.uuid_generate_v4() not null,
  org_id uuid not null,
  scope_type text not null,
  scope_id uuid not null,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now(),
  constraint attachments_pkey primary key (id),
  constraint attachments_org_id_fkey foreign key (org_id) references auth.users(id) on delete cascade
);

create index if not exists attachments_scope_idx on public.attachments(scope_type, scope_id);

alter table public.attachments enable row level security;

create policy "attachments_owner" on public.attachments
  for all using (auth.uid() = org_id) with check (auth.uid() = org_id);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_storage_owner"
  on storage.objects
  for all
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
