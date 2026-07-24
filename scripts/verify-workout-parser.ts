/* Verification for the deterministic half of workout-text-parser.
   The AI call is not exercised here; buildSetRows/isReadyToSave are the write
   path and must be provably correct.
   Run with: npx tsx scripts/verify-workout-parser.ts */
import {
  buildSetRows,
  isReadyToSave,
  MATCH_CONFIDENCE_THRESHOLD,
  type ParsedWorkout,
  type ParsedExercise,
} from '../src/lib/fitness/workout-text-parser';
import { findExerciseSuggestions } from '../src/lib/fitness/ai';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const ex = (over: Partial<ParsedExercise> = {}): ParsedExercise => ({
  raw_name: 'bench press',
  exercise_id: 'ex-bench',
  matched_name: 'Bench Press',
  match_confidence: 0.95,
  candidates: [],
  sets: [
    { set_number: 1, set_type: 'working', reps: 8, weight_lbs: 135, rpe: null, notes: null },
    { set_number: 2, set_type: 'working', reps: 8, weight_lbs: 135, rpe: null, notes: null },
  ],
  ...over,
});

const wk = (exercises: ParsedExercise[]): ParsedWorkout => ({
  workout_type: 'strength',
  workout_date: null,
  duration_minutes: 45,
  rpe_session: 7,
  notes: null,
  exercises,
  warnings: [],
});

console.log('\n--- isReadyToSave ---');
check('all matched -> ready', isReadyToSave(wk([ex()])));
check('any unmatched -> not ready', !isReadyToSave(wk([ex(), ex({ exercise_id: null })])));
check('empty -> not ready', !isReadyToSave(wk([])));

console.log('\n--- buildSetRows ---');
const rows = buildSetRows(wk([ex()]), 'log-1');
check('one row per set', rows.length === 2, rows.length);
check('parent id set on every row', rows.every(r => r.workout_log_id === 'log-1'));
check('exercise_id carried through', rows.every(r => r.exercise_id === 'ex-bench'));
check('weight and reps preserved', rows[0].reps === 8 && rows[0].weight_lbs === 135);

// Renumbering: a hand-edited preview can arrive with duplicate or gapped
// set_numbers. The write path must normalise them.
const messy = buildSetRows(
  wk([
    ex({
      sets: [
        { set_number: 5, set_type: 'warmup', reps: 10, weight_lbs: 45, rpe: null, notes: null },
        { set_number: 5, set_type: 'working', reps: 8, weight_lbs: 135, rpe: 8, notes: null },
        { set_number: 99, set_type: 'working', reps: 6, weight_lbs: 155, rpe: 9, notes: 'grinder' },
      ],
    }),
  ]),
  'log-2'
);
check('set_number renumbered 1..n', messy.map(r => r.set_number).join(',') === '1,2,3',
  messy.map(r => r.set_number));
check('set_type preserved through renumber', messy[0].set_type === 'warmup' && messy[1].set_type === 'working');
check('rpe and notes preserved', messy[2].rpe === 9 && messy[2].notes === 'grinder');

// Numbering restarts per exercise, not across the workout.
const twoEx = buildSetRows(
  wk([ex(), ex({ raw_name: 'row', exercise_id: 'ex-row', matched_name: 'Row' })]),
  'log-3'
);
check('numbering restarts per exercise', twoEx.map(r => r.set_number).join(',') === '1,2,1,2',
  twoEx.map(r => r.set_number));

// Unmatched exercises must never reach the database.
const withUnmatched = buildSetRows(wk([ex(), ex({ exercise_id: null, raw_name: 'mystery lift' })]), 'log-4');
check('unmatched exercises excluded from rows', withUnmatched.length === 2 &&
  withUnmatched.every(r => r.exercise_id === 'ex-bench'), withUnmatched.length);

// Bodyweight and unknown values must stay null, never become 0.
const bodyweight = buildSetRows(
  wk([ex({ sets: [{ set_number: 1, set_type: 'working', reps: 12, weight_lbs: null, rpe: null, notes: null }] })]),
  'log-5'
);
check('null weight stays null (not 0)', bodyweight[0].weight_lbs === null);
check('null rpe stays null', bodyweight[0].rpe === null);

check('empty workout -> no rows', buildSetRows(wk([]), 'log-6').length === 0);

console.log('\n--- exercise matching (shared fuzzy matcher) ---');
const LIB = [
  { id: 'ex-bench', name: 'Barbell Bench Press', category: 'push', muscle_groups: ['chest'] },
  { id: 'ex-row', name: 'Barbell Row', category: 'pull', muscle_groups: ['back'] },
  { id: 'ex-squat', name: 'Back Squat', category: 'legs', muscle_groups: ['quads'] },
];
const benchTop = findExerciseSuggestions('bench press', LIB, 3)[0];
check('"bench press" resolves to the bench entry', benchTop?.id === 'ex-bench', benchTop);
const nonsenseTop = findExerciseSuggestions('zzzz nonsense', LIB, 3)[0];
check('nonsense scores below the confirm threshold',
  !nonsenseTop || nonsenseTop.similarity < MATCH_CONFIDENCE_THRESHOLD, nonsenseTop);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
