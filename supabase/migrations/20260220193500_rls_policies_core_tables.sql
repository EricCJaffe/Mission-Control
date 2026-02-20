-- Ensure core tables have RLS policies for per-user access.

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.dashboard_scores enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'projects_owner') THEN
    CREATE POLICY "projects_owner" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' AND policyname = 'tasks_owner') THEN
    CREATE POLICY "tasks_owner" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notes' AND policyname = 'notes_owner') THEN
    CREATE POLICY "notes_owner" ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dashboard_scores' AND policyname = 'dashboard_scores_owner') THEN
    CREATE POLICY "dashboard_scores_owner" ON public.dashboard_scores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
