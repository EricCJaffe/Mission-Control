-- A public job page and its applications: the front door to the helper list.
--
-- THE BOUNDARY. /jobs/<slug> is open to the whole internet. It reads ONE
-- posting row, through server code, and shows only that row's fields. The
-- posting's content lives here, not in the repo (which is public), and nothing
-- else in Mission Control is reachable from the page.
--
-- An applicant is not a helper: applying creates a row here and nothing else.
-- Eric decides who becomes a worker and gets a login, on /helpers.

create table if not exists mission.job_postings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  slug          text not null unique,
  title         text not null,
  summary       text,
  duties        text[] not null default '{}',
  schedule      text,
  requirements  text[] not null default '{}',
  pay           text,
  location      text,
  contact_phone text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists mission.job_applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  posting_id      uuid not null references mission.job_postings(id) on delete cascade,
  name            text not null,
  phone           text not null,
  email           text,
  drivers_license boolean not null,
  experience      text,
  availability    text,
  heard_from      text,
  -- sha256 of the client IP with a server secret: enough to rate-limit, not
  -- enough to identify anyone.
  ip_hash         text,
  status          text not null default 'new',
  worker_id       uuid references mission.workers(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint job_applications_status_check check (status in ('new','contacted','hired','declined'))
);
create index if not exists job_applications_owner_idx on mission.job_applications (user_id, created_at desc);
create index if not exists job_applications_rate_idx on mission.job_applications (ip_hash, created_at desc);

alter table mission.job_postings     enable row level security;
alter table mission.job_applications enable row level security;

-- Owner-only through the API. The public page and the apply route use the
-- service role and touch exactly one posting and one insert.
drop policy if exists job_postings_owner on mission.job_postings;
create policy job_postings_owner on mission.job_postings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists job_applications_owner on mission.job_applications;
create policy job_applications_owner on mission.job_applications
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
