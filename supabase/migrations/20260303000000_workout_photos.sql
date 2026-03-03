-- Workout session photos stored in Supabase Storage (health-files bucket)
CREATE TABLE IF NOT EXISTS public.workout_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_log_id uuid NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  photo_type text CHECK (photo_type IN ('form_check', 'progress', 'pump', 'other')) DEFAULT 'other',
  notes text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_photos_user_id_idx ON public.workout_photos(user_id);
CREATE INDEX IF NOT EXISTS workout_photos_workout_idx ON public.workout_photos(workout_log_id);

ALTER TABLE public.workout_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_photos_owner ON public.workout_photos
  FOR ALL USING (auth.uid() = user_id);
