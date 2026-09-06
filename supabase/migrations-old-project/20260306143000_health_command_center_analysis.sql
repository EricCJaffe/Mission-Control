-- Persist the latest comprehensive health command center analysis per user

CREATE TABLE IF NOT EXISTS health_command_center_analysis (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_json jsonb NOT NULL,
  snapshot_json jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE health_command_center_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own health command center analysis"
  ON health_command_center_analysis;

CREATE POLICY "Users can manage own health command center analysis"
  ON health_command_center_analysis FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION upsert_health_command_center_analysis(
  p_user_id uuid,
  p_analysis jsonb,
  p_snapshot jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION get_health_command_center_analysis(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row health_command_center_analysis%ROWTYPE;
BEGIN
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
