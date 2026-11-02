/**
 * Manual dataset ids for push/pull exercises the fuzzy matcher does not accept.
 *
 * A string is a dataset `id` from hasaneyldrm/exercises-dataset. `null` means
 * the closest clips are a different movement, so the logger shows no demo.
 *
 * After editing, regenerate the catalog:
 *   node scripts/match-exercise-demos.ts /path/to/exercises.json
 */
export const EXERCISE_DEMO_OVERRIDES: Record<string, string | null> = {
  // Assisted, oblique, and straight-leg raises are different exercises.
  'Hanging Knee Raise': null,
  // "Leg curl" does not say seated or lying, so both machine clips tie below
  // the confidence line. Seated is the selectorized machine; lying is 0586
  // if the station is the prone one.
  'Leg Curl (Machine)': '0599',
  // Dataset name is "lever triceps extension". The steps lower the handles
  // toward the forehead and press them back up — the overhead machine press.
  'Overhead Tricep Press (Machine)': '0607',
  // No row is named "ab crunch machine". The chest-pad seated crunch is that
  // station. The unpadded seated crunch is 1452.
  'Ab Crunch (Machine)': '0595',
};
