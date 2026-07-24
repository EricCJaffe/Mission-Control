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

CREATE INDEX IF NOT EXISTS ai_output_cache_user_key_idx
  ON public.ai_output_cache(user_id, cache_key);

CREATE OR REPLACE FUNCTION public.upsert_ai_output_cache(
  p_user_id uuid,
  p_cache_key text,
  p_payload jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generated_at timestamptz;
BEGIN
  INSERT INTO public.ai_output_cache (user_id, cache_key, payload, generated_at, updated_at)
  VALUES (p_user_id, p_cache_key, p_payload, now(), now())
  ON CONFLICT (user_id, cache_key) DO UPDATE
  SET payload = EXCLUDED.payload,
      generated_at = now(),
      updated_at = now()
  RETURNING generated_at INTO v_generated_at;

  RETURN v_generated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_output_cache(
  p_user_id uuid,
  p_cache_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ai_output_cache%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.ai_output_cache
  WHERE user_id = p_user_id AND cache_key = p_cache_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'payload', v_row.payload,
    'generated_at', v_row.generated_at
  );
END;
$$;
