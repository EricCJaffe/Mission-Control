create table if not exists public.book_proposals (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  org_id uuid not null,
  proposal_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.book_proposals enable row level security;

create policy "book_proposals_select_own"
on public.book_proposals
for select
using (auth.uid() = org_id);

create policy "book_proposals_insert_own"
on public.book_proposals
for insert
with check (auth.uid() = org_id);

create policy "book_proposals_update_own"
on public.book_proposals
for update
using (auth.uid() = org_id);

create policy "book_proposals_delete_own"
on public.book_proposals
for delete
using (auth.uid() = org_id);

create index if not exists book_proposals_book_id_idx on public.book_proposals (book_id);
create index if not exists book_proposals_status_idx on public.book_proposals (status);
