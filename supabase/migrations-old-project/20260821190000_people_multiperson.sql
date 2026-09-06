-- Who a health record is ABOUT, separately from whose account it lives in.
--
-- Eric manages Mary Jo's labs, medications and appointments so he can talk to
-- her doctors — she will not log in. So this is not multi-user auth: one
-- account, several people. Every row still belongs to Eric's user_id and RLS is
-- unchanged; person_id only says who the record describes.
--
-- The safety property that matters: person_id defaults to the account holder,
-- and only the explicitly person-aware pages ever look at anything else. The AI
-- context, health.md, morning briefing and command centre all filter to the
-- self person, so a spouse's cholesterol can never leak into the account
-- holder's trends or his cardiologist prep.

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  /* 'self' is the account holder. Exactly one per account. */
  relationship text not null default 'other'
    check (relationship in ('self','spouse','child','parent','other')),
  date_of_birth date,
  sex text check (sex is null or sex in ('M','F','other')),
  is_self boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_one_self_per_user
  on public.people (user_id) where is_self;
create index if not exists people_user_idx on public.people (user_id, active);

alter table public.people enable row level security;
drop policy if exists "people_owner" on public.people;
create policy "people_owner" on public.people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.lab_panels   add column if not exists person_id uuid references public.people(id) on delete cascade;
alter table public.lab_results  add column if not exists person_id uuid references public.people(id) on delete cascade;
alter table public.medications  add column if not exists person_id uuid references public.people(id) on delete cascade;
alter table public.appointments add column if not exists person_id uuid references public.people(id) on delete cascade;

create index if not exists lab_panels_person_idx   on public.lab_panels (person_id, panel_date desc);
create index if not exists lab_results_person_idx  on public.lab_results (person_id);
create index if not exists medications_person_idx  on public.medications (person_id, active);
create index if not exists appointments_person_idx on public.appointments (person_id, appointment_date desc);

-- Give every existing account a 'self' person and point all existing health
-- rows at it. Idempotent: re-running changes nothing.
insert into public.people (user_id, full_name, relationship, is_self)
select distinct u.id, coalesce(u.email, 'Me'), 'self', true
from auth.users u
where not exists (select 1 from public.people p where p.user_id = u.id and p.is_self);

update public.lab_panels t set person_id = p.id
  from public.people p where p.user_id = t.user_id and p.is_self and t.person_id is null;
update public.lab_results t set person_id = p.id
  from public.people p where p.user_id = t.user_id and p.is_self and t.person_id is null;
update public.medications t set person_id = p.id
  from public.people p where p.user_id = t.user_id and p.is_self and t.person_id is null;
update public.appointments t set person_id = p.id
  from public.people p where p.user_id = t.user_id and p.is_self and t.person_id is null;

notify pgrst, 'reload schema';
