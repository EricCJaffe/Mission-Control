-- Add analysis_json column to health_file_uploads to persist AI analysis results
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'health_file_uploads'
    AND column_name = 'analysis_json'
  ) THEN
    ALTER TABLE public.health_file_uploads
      ADD COLUMN analysis_json jsonb;
  END IF;
END $$;

-- RPC function to update file upload with analysis (bypasses PostgREST schema cache)
CREATE OR REPLACE FUNCTION update_file_upload_analysis(
  p_file_id uuid,
  p_user_id uuid,
  p_analysis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

-- RPC function to read analysis_json (bypasses PostgREST schema cache)
CREATE OR REPLACE FUNCTION get_file_upload_analysis(
  p_file_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analysis jsonb;
BEGIN
  SELECT analysis_json INTO v_analysis
  FROM health_file_uploads
  WHERE id = p_file_id
  AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'analysis', v_analysis);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
