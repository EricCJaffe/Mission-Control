-- Exercise attribute metadata for the movement-coverage model.
--
-- The coverage model asks a longevity question — is your training well-rounded
-- across everything a body needs (Galpin): strength, muscle, endurance, aerobic
-- capacity, long-duration base, mobility, power/speed, balance, and movement in
-- all three planes. Six of those are already derivable from set_logs +
-- cardio_logs + exercise category. The remaining three (power/speed, balance,
-- plane variety) are not — nothing in the schema says an exercise is explosive,
-- single-leg, or frontal/transverse-plane. This migration adds that.
--
-- All columns are nullable/defaulted so existing rows and any un-tagged custom
-- exercises stay valid; the coverage model treats null metadata as "unknown"
-- rather than "absent", so a missing tag never fabricates a coverage gap.

ALTER TABLE public.exercises
  -- Planes the movement primarily loads. Most lifts are sagittal; frontal and
  -- transverse are the commonly-neglected ones the model watches for.
  ADD COLUMN IF NOT EXISTS movement_planes text[] DEFAULT '{}',
  -- What the exercise is typically trained FOR. 'power' = explosive/fast intent
  -- (the "haven't loaded anything fast in months" signal). Others are advisory.
  ADD COLUMN IF NOT EXISTS velocity_intent text
    CHECK (velocity_intent IN ('strength', 'hypertrophy', 'power', 'endurance', 'mixed')),
  -- Single-limb work — the main driver of balance/proprioception in a normal
  -- resistance program.
  ADD COLUMN IF NOT EXISTS is_unilateral boolean DEFAULT false,
  -- Explicitly challenges balance (single-leg, unstable, carries).
  ADD COLUMN IF NOT EXISTS trains_balance boolean DEFAULT false,
  -- Meaningfully trains range of motion — dedicated mobility work OR a loaded
  -- full-ROM lift. Lets full-ROM strength count toward mobility coverage, per
  -- Galpin, so ROM does not read as absent without dedicated stretch sessions.
  ADD COLUMN IF NOT EXISTS trains_mobility boolean DEFAULT false;

-- ------------------------------------------------------------
-- Backfill the 52 seed exercises (user_id IS NULL) by name.
-- Values are deliberately conservative: flag power only for genuinely explosive
-- patterns, balance only for single-limb/unstable work, transverse plane only
-- where real rotation occurs.
-- ------------------------------------------------------------

-- Default every seed lift to sagittal + strength intent; specific rows below
-- override. Scoped to template rows so user exercises are never touched.
UPDATE public.exercises
SET movement_planes = '{"sagittal"}',
    velocity_intent = COALESCE(velocity_intent, 'strength')
WHERE user_id IS NULL AND is_template = true
  AND (movement_planes IS NULL OR movement_planes = '{}');

-- Helper pattern: set attributes for a named seed exercise.
-- (Written out per-row rather than via a temp table to keep the migration flat
--  and re-runnable.)

-- PUSH — pressing is sagittal; lateral raise is frontal.
UPDATE public.exercises SET velocity_intent='hypertrophy' WHERE user_id IS NULL AND name IN
  ('Cable Chest Fly','Dumbbell Lateral Raise','Tricep Pushdown (Cable)','Overhead Tricep Extension','Skull Crushers');
UPDATE public.exercises SET movement_planes='{"frontal"}' WHERE user_id IS NULL AND name = 'Dumbbell Lateral Raise';

-- PULL — mostly sagittal; face pull adds transverse/frontal at the shoulder.
UPDATE public.exercises SET velocity_intent='hypertrophy' WHERE user_id IS NULL AND name IN
  ('Face Pull','Barbell Curl','Dumbbell Bicep Curl','Hammer Curl','Shrugs');
UPDATE public.exercises SET movement_planes='{"sagittal","transverse"}' WHERE user_id IS NULL AND name = 'Face Pull';
UPDATE public.exercises SET is_unilateral=true WHERE user_id IS NULL AND name = 'Dumbbell Row';

-- LEGS — single-leg work trains balance; RDL is a hinge.
UPDATE public.exercises SET velocity_intent='hypertrophy' WHERE user_id IS NULL AND name IN
  ('Leg Curl (Machine)','Leg Extension (Machine)','Calf Raise (Standing)');
UPDATE public.exercises SET is_unilateral=true, trains_balance=true WHERE user_id IS NULL AND name IN
  ('Walking Lunge','Bulgarian Split Squat');
-- Full-depth squats/RDL count toward mobility (loaded end-range).
UPDATE public.exercises SET trains_mobility=true WHERE user_id IS NULL AND name IN
  ('Back Squat','Front Squat','Romanian Deadlift (RDL)','Deadlift');

-- CORE — anti-rotation vs rotation; Russian twist is transverse.
UPDATE public.exercises SET velocity_intent='endurance' WHERE user_id IS NULL AND name IN
  ('Plank','Dead Bug','Bird Dog','Hanging Knee Raise','Cable Crunch','Ab Wheel Rollout');
UPDATE public.exercises SET movement_planes='{"transverse"}', velocity_intent='endurance'
  WHERE user_id IS NULL AND name = 'Russian Twist';
UPDATE public.exercises SET trains_balance=true WHERE user_id IS NULL AND name IN ('Bird Dog','Dead Bug');

-- CARDIO — endurance intent; not resistance-plane relevant.
UPDATE public.exercises SET velocity_intent='endurance', movement_planes='{"sagittal"}'
  WHERE user_id IS NULL AND name IN
  ('Treadmill Run','Outdoor Run','Walk','Treadmill Walk','Indoor Cycling (Trainer)','Outdoor Cycling','Elliptical');

-- MOBILITY — all train ROM; thoracic rotation is transverse.
UPDATE public.exercises SET trains_mobility=true, velocity_intent='mixed'
  WHERE user_id IS NULL AND name IN
  ('Foam Rolling','Dynamic Warm-up','Hip Flexor Stretch','Thoracic Rotation');
UPDATE public.exercises SET movement_planes='{"transverse"}'
  WHERE user_id IS NULL AND name = 'Thoracic Rotation';
UPDATE public.exercises SET movement_planes='{"sagittal","frontal","transverse"}'
  WHERE user_id IS NULL AND name = 'Dynamic Warm-up';

-- Note: no seed exercise is genuinely explosive, so none is tagged
-- velocity_intent='power'. That is intentional and correct — it makes the
-- coverage model report power/speed as a real, unfilled gap out of the box
-- rather than hiding it, which is the whole point of the longevity view.

NOTIFY pgrst, 'reload schema';
