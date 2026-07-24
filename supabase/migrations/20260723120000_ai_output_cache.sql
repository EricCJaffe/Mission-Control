-- Generic per-user cache for generated AI output.
--
-- Motivation: several routes called OpenAI unconditionally from a GET that a
-- component fired in a useEffect, so simply opening a page billed a request and
-- re-generated text that had not changed. This table lets those routes split
-- into "GET returns the last saved result for free" and "POST regenerates on an
-- explicit user action" — the same split /api/fitness/health/command-center
-- already uses, generalised so each new AI surface does not need its own table.
--
-- cache_key namespaces the payload (e.g. 'morning_briefing', 'metrics_analytics').
--
-- Deliberately NO helper functions. RLS below is the whole access-control story
-- and the app reads/writes this table directly with the user-scoped client.
-- A SECURITY DEFINER function taking p_user_id would bypass RLS and, because
-- Supabase exposes RPCs to any authenticated caller, would let one user read
-- another's cached health text by passing their uuid. Plain table access also
-- avoids the PostgREST function schema-cache failures this project has hit
-- before (see docs/METHYLATION_BUG.md).

CREATE TABLE IF NOT EXISTS public.ai_output_cache (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cache_key)
);

ALTER TABLE public.ai_output_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_output_cache_owner" ON public.ai_output_cache;

CREATE POLICY "ai_output_cache_owner"
  ON public.ai_output_cache FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
