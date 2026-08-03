-- Prayer module.
--
-- Modelled on Eric's own 2025 prayer journal rather than on a generic list app,
-- because the journal already encodes two independent structures and flattening
-- either one would lose the thing that makes it his.
--
-- 1. SUBJECTS form a tree. "Matt and Becky" contains Briley, Sophia and Noah;
--    Noah contains Mike. You pray for the household and for the people in it,
--    and the nesting is the meaning — so prayer_subjects is self-referential
--    rather than a flat list with a category column.
--
-- 2. MODES come from the Lord's Prayer: praise, submission, provision,
--    repentance, protection, kingdom. His journal is explicit that these are
--    "a framework and set of principles rather than a set of rules", so a mode
--    is an optional lens on a request, never a required field.
--
-- Requests are separate from subjects because a subject persists and its
-- requests turn over: you pray for your father for years, but "peace in the
-- midst of their current circumstances" is a specific petition that can be
-- answered while the subject remains.
--
-- The design decision worth stating: answered prayer is a first-class status,
-- not a delete. The journal's own line — "waiting seems like unanswered
-- prayer" — is the whole reason. A record you can look back over is the point;
-- an app that quietly removes what has been resolved destroys exactly the
-- evidence that makes the practice worth keeping.

create table if not exists public.prayer_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.prayer_subjects(id) on delete cascade,
  name text not null,
  -- Broad grouping from the journal's own headings.
  category text not null default 'other'
    check (category in (
      'family', 'friends', 'church', 'missions', 'government',
      'world', 'work', 'finances', 'self', 'other'
    )),
  notes text,
  scripture_refs text[] not null default '{}',
  -- Sort order within a parent, so households keep their written order.
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prayer_subjects_user_idx on public.prayer_subjects (user_id, category);
create index if not exists prayer_subjects_parent_idx on public.prayer_subjects (parent_id);

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.prayer_subjects(id) on delete cascade,
  body text not null,
  -- The Lord's Prayer lens. Nullable: most requests do not need one.
  mode text check (mode in (
    'praise', 'submission', 'provision', 'repentance', 'protection', 'kingdom'
  )),
  -- 'waiting' is deliberately distinct from 'open'. The journal treats waiting
  -- as a posture in its own right rather than as failure to be answered.
  status text not null default 'open'
    check (status in ('open', 'waiting', 'answered', 'closed')),
  answered_at timestamptz,
  -- How it was answered. The part people actually reread.
  answer_note text,
  scripture_refs text[] not null default '{}',
  -- Urgent items surface first regardless of rotation.
  urgent boolean not null default false,
  last_prayed_at timestamptz,
  prayed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prayer_requests_user_status_idx on public.prayer_requests (user_id, status);
create index if not exists prayer_requests_subject_idx on public.prayer_requests (subject_id);
-- Drives rotation: least-recently-prayed first.
create index if not exists prayer_requests_rotation_idx
  on public.prayer_requests (user_id, last_prayed_at nulls first)
  where status in ('open', 'waiting');

-- One record per session, so "did I pray today" is answerable and the practice
-- can be tracked the same way the other spiritual practices are.
create table if not exists public.prayer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  duration_min integer,
  -- Which requests were actually prayed through.
  request_ids uuid[] not null default '{}',
  modes text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists prayer_sessions_user_date_idx on public.prayer_sessions (user_id, session_date desc);

alter table public.prayer_subjects enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.prayer_sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prayer_subjects', 'prayer_requests', 'prayer_sessions'] loop
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    execute format(
      'create policy %I_owner on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end $$;
