create table if not exists public.flourishing_question_sets (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  name text not null,
  questions jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.flourishing_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('monthly', 'adhoc')),
  review_id uuid references public.monthly_reviews(id) on delete set null,
  question_set_version integer not null,
  responses jsonb not null,
  domain_scores jsonb not null,
  interpretation jsonb not null,
  coaching jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists flourishing_assessments_user_created_idx
  on public.flourishing_assessments(user_id, created_at desc);

create table if not exists public.flourishing_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latest_assessment_id uuid references public.flourishing_assessments(id) on delete set null,
  flourishing_index numeric(4,2),
  display_index numeric(4,1),
  domain_scores jsonb not null default '[]'::jsonb,
  strongest_domains text[] not null default '{}',
  growth_domains text[] not null default '{}',
  overall_message text,
  trend_summary jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.persona_pending_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid references public.flourishing_assessments(id) on delete cascade,
  section_key text not null,
  section_label text not null,
  current_content text not null,
  proposed_content text not null,
  diff_html text,
  reason text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  applied_at timestamptz
);

create index if not exists persona_pending_updates_user_status_idx
  on public.persona_pending_updates(user_id, status, created_at desc);

alter table public.flourishing_question_sets enable row level security;
alter table public.flourishing_assessments enable row level security;
alter table public.flourishing_profiles enable row level security;
alter table public.persona_pending_updates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'flourishing_question_sets' and policyname = 'flourishing_question_sets_read_auth'
  ) then
    create policy "flourishing_question_sets_read_auth"
      on public.flourishing_question_sets for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'flourishing_question_sets' and policyname = 'flourishing_question_sets_insert_auth'
  ) then
    create policy "flourishing_question_sets_insert_auth"
      on public.flourishing_question_sets for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'flourishing_assessments' and policyname = 'flourishing_assessments_owner'
  ) then
    create policy "flourishing_assessments_owner"
      on public.flourishing_assessments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'flourishing_profiles' and policyname = 'flourishing_profiles_owner'
  ) then
    create policy "flourishing_profiles_owner"
      on public.flourishing_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'persona_pending_updates' and policyname = 'persona_pending_updates_owner'
  ) then
    create policy "persona_pending_updates_owner"
      on public.persona_pending_updates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
