-- ============================================================
-- FASTING LOGS
-- Track intermittent fasting windows with AI advisor
-- ============================================================

-- Only create table and related objects if they don't exist
do $$
begin
  -- Check if table exists
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fasting_logs') then
    -- Create table
    create table public.fasting_logs (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      fast_start timestamptz not null,
      fast_end timestamptz,
      target_hours int default 16,
      actual_hours numeric,
      fast_type text default 'intermittent' check (fast_type in ('intermittent', 'extended', 'omad', 'custom')),
      broke_fast_with text,
      energy_level int check (energy_level >= 1 and energy_level <= 10),
      hunger_level int check (hunger_level >= 1 and hunger_level <= 10),
      workout_during_fast boolean default false,
      notes text,
      ai_advice jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Create indexes
    create index fasting_logs_user_id_idx on public.fasting_logs(user_id);
    create index fasting_logs_start_idx on public.fasting_logs(fast_start desc);
    create index fasting_logs_end_idx on public.fasting_logs(fast_end desc) where fast_end is not null;

    -- Enable RLS
    alter table public.fasting_logs enable row level security;

    -- Create policy
    create policy fasting_logs_owner on public.fasting_logs
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

    -- Add comments
    comment on table public.fasting_logs is 'Intermittent fasting tracking with AI timing advisor';
    comment on column public.fasting_logs.fast_start is 'When the fast started (last meal time)';
    comment on column public.fasting_logs.fast_end is 'When the fast ended (first meal after fasting). Null if currently fasting.';
    comment on column public.fasting_logs.actual_hours is 'Calculated: (fast_end - fast_start) in hours';
    comment on column public.fasting_logs.ai_advice is 'AI-generated advice on optimal timing based on workout schedule';
  end if;
end $$;
