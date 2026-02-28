-- Create function to insert genetic markers (bypasses PostgREST schema cache)
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
