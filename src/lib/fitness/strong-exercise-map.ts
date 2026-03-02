/**
 * Maps Strong app exercise names to system exercise names.
 * System names must match exactly what is seeded in the exercises table.
 *
 * Strategy: map to closest existing exercise rather than creating new ones.
 * Exercises in STRONG_SKIP_EXERCISES are ignored during import (cardio/mobility).
 */
export const STRONG_EXERCISE_MAP: Record<string, string> = {
  // ── PUSH: Chest ────────────────────────────────────────────────────────
  'Bench Press (Barbell)':          'Flat Barbell Bench Press',
  'Bench Press (Dumbbell)':         'Flat Dumbbell Press',
  'Bench Press (Smith Machine)':    'Flat Barbell Bench Press',
  'Incline Bench Press (Barbell)':  'Incline Barbell Bench Press',
  'Incline Bench Press (Dumbbell)': 'Incline Dumbbell Press',
  'Chest Fly':                      'Cable Chest Fly',
  'Chest Fly (Band)':               'Cable Chest Fly',
  'Chest Fly (Dumbbell)':           'Cable Chest Fly',
  'Chest Fly Cable Crossover':      'Cable Chest Fly',
  'Cable Crossover':                'Cable Chest Fly',
  'Chest Press (Machine)':          'Flat Barbell Bench Press',
  'Push Up':                        'Push-up',
  'Trx Chest':                      'Push-up',

  // ── PUSH: Shoulders ────────────────────────────────────────────────────
  'Overhead Press (Barbell)':       'Overhead Press (Barbell)',
  'Overhead Press (Dumbbell)':      'Dumbbell Shoulder Press',
  'Shoulder Press (Dumbell)':       'Dumbbell Shoulder Press',
  'Shoulder Press (Plate Loaded)':  'Overhead Press (Barbell)',
  'Shoulder Dumbbell Raise':        'Dumbbell Lateral Raise',

  // ── PUSH: Triceps ──────────────────────────────────────────────────────
  'Triceps Pushdown (Cable - Straight Bar)': 'Tricep Pushdown (Cable)',
  'Triceps Extension':              'Overhead Tricep Extension',
  'Triceps Extension (Barbell)':    'Skull Crushers',
  'Triceps Extension (Cable)':      'Overhead Tricep Extension',
  'Triceps Extension (Dumbbell)':   'Overhead Tricep Extension',

  // ── PULL: Back ─────────────────────────────────────────────────────────
  'Deadlift (Barbell)':             'Deadlift',
  'Trap Bar Deadlift':              'Deadlift',
  'Clean and Jerk (Barbell)':       'Deadlift',
  'Lat Pulldown (Cable)':           'Lat Pulldown',
  'Lat Pulldown (Machine)':         'Lat Pulldown',
  'Seated Row (Cable)':             'Seated Cable Row',
  'Seated Row (Machine)':           'Seated Cable Row',
  'Dumbbell Row':                   'Dumbbell Row',
  'Bent Over One Arm Row (Dumbbell)': 'Dumbbell Row',
  'TRX back':                       'Seated Cable Row',
  'Back Extension (Machine)':       'Romanian Deadlift (RDL)',
  'Upright Row (Cable)':            'Barbell Row',

  // ── PULL: Biceps ───────────────────────────────────────────────────────
  'Bicep Curl (Barbell)':           'Barbell Curl',
  'Bicep Curl Curved Barbell':      'Barbell Curl',
  'Bicep Curl (Cable)':             'Barbell Curl',
  'Bicep Curl (Dumbbell)':          'Dumbbell Bicep Curl',

  // ── PULL: Bodyweight ───────────────────────────────────────────────────
  'Pull Up':                        'Pull-up',
  'Pull Up (Assisted)':             'Pull-up',

  // ── TRAPS ──────────────────────────────────────────────────────────────
  'Shrug (Barbell)':                'Shrugs',
  'Shrug (Dumbbell)':               'Shrugs',
  'Shoulder Shrug':                 'Shrugs',

  // ── LEGS ───────────────────────────────────────────────────────────────
  'Squat (Barbell)':                'Back Squat',
  'Squat (Band)':                   'Back Squat',
  'Squat (Bodyweight)':             'Back Squat',
  'Squat (Dumbbell)':               'Back Squat',
  'Leg Press':                      'Leg Press',
  'Seated Leg Press (Machine)':     'Leg Press',
  'Leg Extension (Machine)':        'Leg Extension (Machine)',
  'Seated Leg Curl (Machine)':      'Leg Curl (Machine)',
  'Calf Press on Leg Press':        'Calf Raise (Standing)',
  'Box Jump':                       'Back Squat',
  'Thruster (Barbell)':             'Overhead Press (Barbell)',
  'Kettlebell Swing':               'Romanian Deadlift (RDL)',
  'Kettlebell Single Arm':          'Dumbbell Row',

  // ── CORE ───────────────────────────────────────────────────────────────
  'Cable Crunch':                   'Cable Crunch',
  'Plank':                          'Plank',
  'Crunch':                         'Cable Crunch',
  'Crunch (Stability Ball)':        'Cable Crunch',
  'Sit Up':                         'Cable Crunch',
  'Cable Twist':                    'Russian Twist',
  'Hanging Knee Raise':             'Hanging Knee Raise',
};

/**
 * Strong exercises to skip entirely during import.
 * Cardio, conditioning, and mobility movements.
 */
export const STRONG_SKIP_EXERCISES = new Set([
  'Running (Treadmill)',
  'Elliptical Machine',
  '200M Run',
  '400M Run',
  'Heavy Bag',
  'Jump Rope',
  'Jumping Jack',
  'Burpee',
  'Stretching',
  'Striking',
]);

/** Parse Strong duration string → integer minutes */
export function parseStrongDuration(str: string): number {
  let minutes = 0;
  const hourMatch = str.match(/(\d+)h/);
  const minMatch = str.match(/(\d+)m/);
  const secMatch = str.match(/^(\d+)s$/);
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  if (secMatch && !hourMatch && !minMatch) minutes = 1; // sub-minute session
  return minutes || 1;
}
