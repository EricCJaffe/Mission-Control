import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISE_DEMO_OVERRIDES } from './exercise-demo-overrides.ts';
import {
  acceptExerciseMatch,
  displayDatasetName,
  rankExerciseMatches,
  resolveRoutineExercise,
  tokenizeExerciseName,
  type DatasetExerciseRef,
} from './exercise-demo-match.ts';
import {
  exerciseDemoGifUrl,
  exerciseDemoImageUrl,
  EXERCISE_DEMO_MEDIA_BASE,
  EXERCISE_DEMO_UNMATCHED,
  lookupExerciseDemo,
} from './exercise-demo-catalog.ts';
import { uniqueStrengthRoutineExercises } from './strength-routine-exercises.ts';

const FIXTURE: DatasetExerciseRef[] = [
  { id: '0025', name: 'barbell bench press', equipment: 'barbell' },
  { id: '0030', name: 'barbell close-grip bench press', equipment: 'barbell' },
  { id: '0047', name: 'barbell incline bench press', equipment: 'barbell' },
  { id: '0052', name: 'barbell jm bench press', equipment: 'barbell' },
  { id: '0739', name: 'sled 45в° leg press', equipment: 'sled machine' },
  { id: '1463', name: 'sled 45° leg press (side pov)', equipment: 'sled machine' },
  { id: '1464', name: 'sled 45в° leg press (back pov)', equipment: 'sled machine' },
  { id: '0760', name: 'smith leg press', equipment: 'smith machine' },
  { id: '0319', name: 'dumbbell incline fly', equipment: 'dumbbell' },
  { id: '0171', name: 'cable incline fly', equipment: 'cable' },
  { id: '0201', name: 'cable pushdown', equipment: 'cable' },
  { id: '0207', name: 'cable reverse-grip pushdown', equipment: 'cable' },
  { id: '0241', name: 'cable triceps pushdown (v-bar)', equipment: 'cable' },
  { id: '0310', name: 'dumbbell front raise', equipment: 'dumbbell' },
  { id: '0309', name: 'dumbbell front raise v. 2', equipment: 'dumbbell' },
  { id: '0041', name: 'barbell front raise', equipment: 'barbell' },
  { id: '0586', name: 'lever lying leg curl', equipment: 'leverage machine' },
  { id: '0599', name: 'lever seated leg curl', equipment: 'leverage machine' },
  { id: '0308', name: 'dumbbell fly', equipment: 'dumbbell' },
  { id: '0607', name: 'lever triceps extension', equipment: 'leverage machine' },
  { id: '0595', name: 'lever seated crunch (chest pad)', equipment: 'leverage machine' },
  { id: '1452', name: 'lever seated crunch', equipment: 'leverage machine' },
  { id: '0334', name: 'dumbbell lateral raise', equipment: 'dumbbell' },
  { id: '0178', name: 'cable lateral raise', equipment: 'cable' },
  { id: '0652', name: 'pull-up', equipment: 'body weight' },
  { id: '0017', name: 'assisted pull-up', equipment: 'leverage machine' },
  { id: '0140', name: 'biceps pull-up', equipment: 'body weight' },
  { id: '0811', name: 'trap bar deadlift', equipment: 'trap bar' },
  { id: '0032', name: 'barbell deadlift', equipment: 'barbell' },
  { id: '0293', name: 'dumbbell bent over row', equipment: 'dumbbell' },
  { id: '0437', name: 'dumbbell upright row', equipment: 'dumbbell' },
  { id: '1329', name: 'dumbbell palm rotational bent over row', equipment: 'dumbbell' },
  { id: '0294', name: 'dumbbell biceps curl', equipment: 'dumbbell' },
  { id: '2330', name: 'cable lat pulldown full range of motion', equipment: 'cable' },
  { id: '0198', name: 'cable pulldown', equipment: 'cable' },
  { id: '1350', name: 'lever seated row', equipment: 'leverage machine' },
  { id: '0861', name: 'cable seated row', equipment: 'cable' },
  { id: '0095', name: 'barbell shrug', equipment: 'barbell' },
  { id: '0406', name: 'dumbbell shrug', equipment: 'dumbbell' },
  { id: '0031', name: 'barbell curl', equipment: 'barbell' },
  { id: '1761', name: 'hanging oblique knee raise', equipment: 'body weight' },
  { id: '0472', name: 'hanging leg raise', equipment: 'body weight' },
  { id: '0011', name: 'assisted hanging knee raise', equipment: 'assisted' },
];

function matchedId(name: string, equipment: string | null): string | null {
  const result = resolveRoutineExercise(name, equipment, FIXTURE, EXERCISE_DEMO_OVERRIDES);
  return result.kind === 'matched' ? result.exercise.id : null;
}

test('tokenizer joins pull-up, trap bar, and bent-over', () => {
  assert.deepEqual(tokenizeExerciseName('Pull-up'), ['pull-up']);
  assert.deepEqual(tokenizeExerciseName('Deadlift (Trap Bar)'), ['deadlift', 'trap-bar']);
  assert.deepEqual(tokenizeExerciseName('dumbbell bent over row'), ['dumbbell', 'row']);
  assert.equal(displayDatasetName('sled 45в° leg press'), 'sled 45° leg press');
});

test('fuzzy match picks the plain movement over a close variant', () => {
  assert.equal(matchedId('Flat Barbell Bench Press', 'barbell'), '0025');
  assert.equal(matchedId('Incline Barbell Bench Press', 'barbell'), '0047');
  assert.equal(matchedId('Incline Dumbbell Fly', 'dumbbell'), '0319');
  assert.equal(matchedId('Flat Dumbbell Fly', 'dumbbell'), '0308');
  assert.equal(matchedId('Tricep Pushdown (Cable)', 'cable'), '0201');
  assert.equal(matchedId('Front Dumbbell Raise', 'dumbbell'), '0310');
  assert.equal(matchedId('Dumbbell Lateral Raise', 'dumbbell'), '0334');
  assert.equal(matchedId('Pull-up', 'bodyweight'), '0652');
  assert.equal(matchedId('Deadlift (Trap Bar)', null), '0811');
  assert.equal(matchedId('Dumbbell Row', 'dumbbell'), '0293');
  assert.equal(matchedId('Dumbbell Bicep Curl', 'dumbbell'), '0294');
  assert.equal(matchedId('Lat Pulldown', 'cable'), '2330');
  assert.equal(matchedId('Seated Row (Machine)', 'machine'), '1350');
  assert.equal(matchedId('Shrugs', 'barbell'), '0095');
  assert.equal(matchedId('Barbell Curl', 'barbell'), '0031');
  assert.equal(matchedId('Leg Press', 'machine'), '0739');
});

test('upright row does not win a dumbbell row', () => {
  const ranked = rankExerciseMatches('Dumbbell Row', 'dumbbell', FIXTURE);
  assert.equal(ranked[0]?.exercise.id, '0293');
  assert.notEqual(ranked[0]?.exercise.name, 'dumbbell upright row');
});

test('leg curl stays unmatched until the manual override', () => {
  const open = resolveRoutineExercise('Leg Curl (Machine)', 'machine', FIXTURE, {});
  assert.equal(open.kind, 'unmatched');
  const pinned = resolveRoutineExercise('Leg Curl (Machine)', 'machine', FIXTURE, EXERCISE_DEMO_OVERRIDES);
  assert.equal(pinned.kind, 'matched');
  if (pinned.kind === 'matched') {
    assert.equal(pinned.via, 'override');
    assert.equal(pinned.exercise.id, '0599');
  }
});

test('hanging knee raise is a recorded miss', () => {
  const result = resolveRoutineExercise('Hanging Knee Raise', 'bodyweight', FIXTURE, EXERCISE_DEMO_OVERRIDES);
  assert.equal(result.kind, 'unmatched');
  const ranked = rankExerciseMatches('Hanging Knee Raise', 'bodyweight', FIXTURE);
  assert.equal(acceptExerciseMatch(ranked), null);
});

test('a null override beats a confident fuzzy hit', () => {
  const result = resolveRoutineExercise('Pull-up', 'bodyweight', FIXTURE, { 'Pull-up': null });
  assert.equal(result.kind, 'unmatched');
  if (result.kind === 'unmatched') {
    assert.match(result.reason, /Manual override/);
  }
});

test('committed catalog covers every push and pull exercise', () => {
  const names = new Set(uniqueStrengthRoutineExercises().map((row) => row.name));
  assert.equal(names.size, 20);
  for (const name of names) {
    const demo = lookupExerciseDemo(name);
    const missed = EXERCISE_DEMO_UNMATCHED.some((row) => row.routineName === name);
    assert.equal(demo != null || missed, true, name);
    assert.equal(demo != null && missed, false, name);
  }
  assert.deepEqual(
    EXERCISE_DEMO_UNMATCHED.map((row) => row.routineName),
    ['Hanging Knee Raise'],
  );
});

test('catalog media is a pinned dataset URL, not a file in this repo', () => {
  assert.equal(
    EXERCISE_DEMO_MEDIA_BASE,
    'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/',
  );
  const bench = lookupExerciseDemo('Flat Barbell Bench Press');
  assert.ok(bench);
  assert.equal(bench.datasetId, '0025');
  assert.equal(bench.steps.length > 0, true);
  assert.equal(bench.image.startsWith('images/'), true);
  assert.equal(bench.gif.startsWith('videos/'), true);
  assert.equal(exerciseDemoImageUrl(bench).startsWith(EXERCISE_DEMO_MEDIA_BASE), true);
  assert.equal(exerciseDemoGifUrl(bench).endsWith('.gif'), true);
  assert.equal(exerciseDemoGifUrl(bench).includes('/workspace'), false);
  const curl = lookupExerciseDemo('leg curl (machine)');
  assert.equal(curl?.via, 'override');
  assert.equal(curl?.datasetId, '0599');
  assert.equal(lookupExerciseDemo('Overhead Tricep Press (Machine)')?.datasetId, '0607');
  assert.equal(lookupExerciseDemo('Ab Crunch (Machine)')?.datasetId, '0595');
  assert.equal(lookupExerciseDemo('Hanging Knee Raise'), null);
});
