-- Ensure genetic_markers has all required columns
-- The original migration defines risk_level but it may not exist if the table
-- was created by an earlier version of the schema

DO $$
BEGIN
  -- Add risk_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'risk_level'
  ) THEN
    ALTER TABLE public.genetic_markers
      ADD COLUMN risk_level text CHECK (risk_level IN ('normal', 'moderate', 'high'));
  END IF;

  -- Add clinical_significance if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'clinical_significance'
  ) THEN
    ALTER TABLE public.genetic_markers
      ADD COLUMN clinical_significance text;
  END IF;

  -- Add supplement_implications if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'genetic_markers'
    AND column_name = 'supplement_implications'
  ) THEN
    ALTER TABLE public.genetic_markers
      ADD COLUMN supplement_implications text;
  END IF;
END $$;

-- Recreate the RPC function to match current schema
CREATE OR REPLACE FUNCTION insert_genetic_markers(
  p_user_id uuid,
  p_file_id uuid,
  p_markers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marker jsonb;
  v_inserted_count integer := 0;
BEGIN
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

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
