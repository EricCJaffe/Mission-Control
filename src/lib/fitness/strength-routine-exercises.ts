/**
 * Exercises in Eric's Push A / Push B / Pull A / Pull B days.
 *
 * Names match `scripts/seed-strength-templates.ts`. Equipment is the library
 * value (or null when only the name carries it) and is a hint for matching,
 * not a second source of truth for the logger.
 */
export type StrengthRoutineExercise = {
  name: string;
  equipment: string | null;
  day: 'Push A' | 'Push B' | 'Pull A' | 'Pull B';
};

export const STRENGTH_ROUTINE_EXERCISES: StrengthRoutineExercise[] = [
  { day: 'Push A', name: 'Flat Barbell Bench Press', equipment: 'barbell' },
  { day: 'Push A', name: 'Leg Press', equipment: 'machine' },
  { day: 'Push A', name: 'Incline Dumbbell Fly', equipment: 'dumbbell' },
  { day: 'Push A', name: 'Hanging Knee Raise', equipment: 'bodyweight' },
  { day: 'Push A', name: 'Tricep Pushdown (Cable)', equipment: 'cable' },
  { day: 'Push A', name: 'Front Dumbbell Raise', equipment: 'dumbbell' },
  { day: 'Push B', name: 'Incline Barbell Bench Press', equipment: 'barbell' },
  { day: 'Push B', name: 'Leg Curl (Machine)', equipment: 'machine' },
  { day: 'Push B', name: 'Flat Dumbbell Fly', equipment: 'dumbbell' },
  { day: 'Push B', name: 'Overhead Tricep Press (Machine)', equipment: 'machine' },
  { day: 'Push B', name: 'Ab Crunch (Machine)', equipment: 'machine' },
  { day: 'Push B', name: 'Dumbbell Lateral Raise', equipment: 'dumbbell' },
  { day: 'Pull A', name: 'Pull-up', equipment: 'bodyweight' },
  { day: 'Pull A', name: 'Deadlift (Trap Bar)', equipment: null },
  { day: 'Pull A', name: 'Dumbbell Row', equipment: 'dumbbell' },
  { day: 'Pull A', name: 'Dumbbell Bicep Curl', equipment: 'dumbbell' },
  { day: 'Pull A', name: 'Lat Pulldown', equipment: 'cable' },
  { day: 'Pull B', name: 'Pull-up', equipment: 'bodyweight' },
  { day: 'Pull B', name: 'Seated Row (Machine)', equipment: 'machine' },
  { day: 'Pull B', name: 'Shrugs', equipment: 'barbell' },
  { day: 'Pull B', name: 'Barbell Curl', equipment: 'barbell' },
];

/** One row per exercise name. Pull-up is on both pull days. */
export function uniqueStrengthRoutineExercises(): StrengthRoutineExercise[] {
  const seen = new Set<string>();
  const out: StrengthRoutineExercise[] = [];
  for (const exercise of STRENGTH_ROUTINE_EXERCISES) {
    const key = exercise.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(exercise);
  }
  return out;
}
