CREATE TABLE IF NOT EXISTS genetics_comprehensive_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_json jsonb NOT NULL,
  file_ids uuid[] NOT NULL DEFAULT '{}',
  report_types text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_genetics_comprehensive_user UNIQUE (user_id)
);

ALTER TABLE genetics_comprehensive_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own genetics comprehensive analysis"
  ON genetics_comprehensive_analysis FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION upsert_genetics_comprehensive_analysis(
  p_user_id uuid,
  p_analysis jsonb,
  p_file_ids uuid[],
  p_report_types text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION get_genetics_comprehensive_analysis(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row genetics_comprehensive_analysis%ROWTYPE;
BEGIN
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

NOTIFY pgrst, 'reload schema';
