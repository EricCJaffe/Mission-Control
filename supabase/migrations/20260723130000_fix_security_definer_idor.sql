-- Close an IDOR across every SECURITY DEFINER helper that takes p_user_id.
--
-- THE BUG
-- SECURITY DEFINER makes a function run as its owner, which bypasses RLS on the
-- tables it touches. Supabase exposes every function in `public` as a PostgREST
-- RPC callable by any authenticated user. These functions accepted p_user_id and
-- never compared it to auth.uid(), so a signed-in user could pass someone else's
-- uuid and read or write their data:
--
--   get_genetics_comprehensive_analysis  -> another user's genetic analysis
--   get_health_command_center_analysis   -> another user's health analysis
--   get_file_upload_analysis             -> another user's uploaded-report analysis
--   update_file_upload_analysis          -> overwrite another user's analysis
--   upsert_genetics_comprehensive_analysis \ overwrite another user's saved
--   upsert_health_command_center_analysis  / analysis
--   insert_genetic_markers               -> write markers into another user's record
--
-- All of these carry health data. RLS on the underlying tables did not help,
-- precisely because SECURITY DEFINER skips it.
--
-- THE FIX
-- Every function now rejects a p_user_id that is not the caller. `IS DISTINCT
-- FROM` is deliberate: when auth.uid() is NULL (unauthenticated, or a
-- service-role caller) it is DISTINCT from any uuid, so the guard fails closed
-- rather than matching NULL = NULL.
--
-- SECURITY DEFINER is retained rather than switched to INVOKER. These helpers
-- exist to work around PostgREST schema-cache failures (docs/METHYLATION_BUG.md),
-- and dropping to INVOKER would additionally depend on the `authenticated` role
-- holding direct table privileges — unverified, and a silent breakage risk.
-- Keeping DEFINER plus an explicit guard changes nothing for legitimate callers.
--
-- Signatures are byte-identical to the originals. CREATE OR REPLACE only
-- replaces when the argument list matches exactly; any drift would silently
-- create an overload and leave the vulnerable version callable.
--
-- All 20 call sites use supabaseServer() (anon key + session cookie), so
-- auth.uid() is populated and no application code needs to change.
--
-- SET search_path = public is added throughout: a SECURITY DEFINER function
-- without a pinned search_path can be hijacked via a caller-controlled path.

-- ============================================================
-- genetic_markers
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_genetic_markers(
  p_user_id uuid,
  p_file_id uuid,
  p_markers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marker jsonb;
  v_inserted_count integer := 0;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  FOR v_marker IN SELECT * FROM jsonb_array_elements(p_markers)
  LOOP
    INSERT INTO genetic_markers (
      user_id,
      file_id,
      snp_id,
      gene,
      genotype,
      risk_level,
      clinical_significance,
      supplement_implications
    ) VALUES (
      p_user_id,
      p_file_id,
      v_marker->>'snp_id',
      v_marker->>'gene',
      v_marker->>'genotype',
      v_marker->>'risk_level',
      v_marker->>'clinical_significance',
      v_marker->>'supplement_implications'
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_inserted_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- health_file_uploads.analysis_json
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_file_upload_analysis(
  p_file_id uuid,
  p_user_id uuid,
  p_analysis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  UPDATE health_file_uploads
  SET
    processing_status = 'completed',
    processed_at = now(),
    analysis_json = p_analysis
  WHERE id = p_file_id
  AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_file_upload_analysis(
  p_file_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_analysis jsonb;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  SELECT analysis_json INTO v_analysis
  FROM health_file_uploads
  WHERE id = p_file_id
  AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'analysis', v_analysis);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- genetics_comprehensive_analysis
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_genetics_comprehensive_analysis(
  p_user_id uuid,
  p_analysis jsonb,
  p_file_ids uuid[],
  p_report_types text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  INSERT INTO genetics_comprehensive_analysis
    (user_id, analysis_json, file_ids, report_types, generated_at)
  VALUES
    (p_user_id, p_analysis, p_file_ids, p_report_types, now())
  ON CONFLICT (user_id) DO UPDATE
    SET analysis_json  = EXCLUDED.analysis_json,
        file_ids       = EXCLUDED.file_ids,
        report_types   = EXCLUDED.report_types,
        generated_at   = EXCLUDED.generated_at;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_genetics_comprehensive_analysis(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row genetics_comprehensive_analysis%ROWTYPE;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  SELECT * INTO v_row
  FROM genetics_comprehensive_analysis
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found',        true,
    'analysis',     v_row.analysis_json,
    'file_ids',     v_row.file_ids,
    'report_types', v_row.report_types,
    'generated_at', v_row.generated_at
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('found', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- health_command_center_analysis
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_health_command_center_analysis(
  p_user_id uuid,
  p_analysis jsonb,
  p_snapshot jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  INSERT INTO health_command_center_analysis (
    user_id,
    analysis_json,
    snapshot_json,
    generated_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_analysis,
    p_snapshot,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET analysis_json = EXCLUDED.analysis_json,
      snapshot_json = EXCLUDED.snapshot_json,
      generated_at = now(),
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_health_command_center_analysis(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row health_command_center_analysis%ROWTYPE;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id does not match the authenticated user';
  END IF;

  SELECT *
  INTO v_row
  FROM health_command_center_analysis
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'analysis', v_row.analysis_json,
    'snapshot', v_row.snapshot_json,
    'generated_at', v_row.generated_at
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
