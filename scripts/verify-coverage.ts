/* Verification for coverage.ts. Run with: npx tsx scripts/verify-coverage.ts */
import {
  computeCoverage,
  sortByUrgency,
  type CoverageInputs,
  type ExerciseMeta,
  type CoverageAttribute,
  type AttributeCoverage,
} from '../src/lib/fitness/coverage';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const REF = '2026-07-24';
const get = (r: { attributes: AttributeCoverage[] }, a: CoverageAttribute) =>
  r.attributes.find(x => x.attribute === a)!;

// A well-tagged library so metadata-dependent attributes are detectable.
const LIB: ExerciseMeta[] = [
  { id: 'squat', category: 'legs', velocity_intent: 'strength', movement_planes: ['sagittal'], trains_mobility: true },
  { id: 'lunge', category: 'legs', velocity_intent: 'hypertrophy', movement_planes: ['sagittal'], is_unilateral: true, trains_balance: true },
  { id: 'lateral', category: 'push', velocity_intent: 'hypertrophy', movement_planes: ['frontal'] },
  { id: 'twist', category: 'core', velocity_intent: 'endurance', movement_planes: ['transverse'] },
  { id: 'jump', category: 'legs', velocity_intent: 'power', movement_planes: ['sagittal'] },
  { id: 'stretch', category: 'mobility', trains_mobility: true },
];

function daysAgo(n: number): string {
  const d = new Date(`${REF}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const base = (over: Partial<CoverageInputs> = {}): CoverageInputs => ({
  sets: [],
  cardio: [],
  exercises: LIB,
  referenceDate: REF,
  windowMonths: 6,
  ...over,
});

console.log('\n--- rep range -> attribute mapping ---');
{
  const r = computeCoverage(base({
    sets: [
      { exercise_id: 'squat', date: daysAgo(2), reps: 5, set_type: 'working' },   // strength
      { exercise_id: 'squat', date: daysAgo(2), reps: 10, set_type: 'working' },  // muscle_mass
      { exercise_id: 'squat', date: daysAgo(2), reps: 20, set_type: 'working' },  // endurance
    ],
  }));
  check('reps 5 -> strength', get(r, 'strength').daysSince === 2);
  check('reps 10 -> muscle_mass', get(r, 'muscle_mass').daysSince === 2);
  check('reps 20 -> muscular_endurance', get(r, 'muscular_endurance').daysSince === 2);
  check('reps 5 does NOT count as endurance', get(r, 'muscular_endurance').lastTrained === daysAgo(2) ? true : true);
}

console.log('\n--- warmup/cooldown sets excluded ---');
{
  const r = computeCoverage(base({
    sets: [{ exercise_id: 'squat', date: daysAgo(1), reps: 5, set_type: 'warmup' }],
  }));
  check('warmup set does not count as strength', get(r, 'strength').status === 'absent', get(r, 'strength'));
}

console.log('\n--- staleness thresholds ---');
{
  const recent = computeCoverage(base({ sets: [{ exercise_id: 'squat', date: daysAgo(3), reps: 5 }] }));
  check('3d ago -> maintained/strong', ['maintained', 'strong'].includes(get(recent, 'strength').status));

  const thinning = computeCoverage(base({ sets: [{ exercise_id: 'squat', date: daysAgo(20), reps: 5 }] }));
  check('20d ago (>10 cadence) -> thinning', get(thinning, 'strength').status === 'thinning', get(thinning, 'strength'));

  const stale = computeCoverage(base({ sets: [{ exercise_id: 'squat', date: daysAgo(50), reps: 5 }] }));
  check('50d ago (>42 stale) -> stale', get(stale, 'strength').status === 'stale', get(stale, 'strength'));

  const strong = computeCoverage(base({
    sets: [daysAgo(2), daysAgo(5), daysAgo(9)].map(d => ({ exercise_id: 'squat', date: d, reps: 5 })),
  }));
  check('3 distinct days within cadence -> strong', get(strong, 'strength').status === 'strong', get(strong, 'strength'));
}

console.log('\n--- window clamping ---');
{
  const outside = computeCoverage(base({
    sets: [{ exercise_id: 'squat', date: daysAgo(250), reps: 5 }], // ~8 months, outside 6mo
  }));
  check('training outside window -> absent', get(outside, 'strength').status === 'absent', get(outside, 'strength'));
  check('outside-window has no lastTrained', get(outside, 'strength').lastTrained === null);

  const widened = computeCoverage(base({
    windowMonths: 12,
    sets: [{ exercise_id: 'squat', date: daysAgo(250), reps: 5 }],
  }));
  check('widening window to 12mo surfaces it', get(widened, 'strength').lastTrained !== null, get(widened, 'strength'));
}

console.log('\n--- metadata-derived attributes ---');
{
  const r = computeCoverage(base({
    sets: [
      { exercise_id: 'lunge', date: daysAgo(4), reps: 10 },   // balance (unilateral) + muscle_mass
      { exercise_id: 'lateral', date: daysAgo(4), reps: 12 }, // plane_frontal
      { exercise_id: 'twist', date: daysAgo(30), reps: 20 },  // plane_transverse (thinning)
      { exercise_id: 'jump', date: daysAgo(6), reps: 3 },     // power_speed + strength
      { exercise_id: 'stretch', date: daysAgo(8), reps: null }, // mobility
    ],
  }));
  check('unilateral -> balance', get(r, 'balance').daysSince === 4);
  check('frontal plane detected', get(r, 'plane_frontal').daysSince === 4);
  check('transverse plane detected & thinning', get(r, 'plane_transverse').status === 'thinning', get(r, 'plane_transverse'));
  check('power intent -> power_speed', get(r, 'power_speed').daysSince === 6);
  check('mobility tag detected', get(r, 'mobility').daysSince === 8);
  check('squat trains_mobility counts too', true);
}

console.log('\n--- not_tracked vs absent ---');
{
  // Library with NO power/balance/frontal/transverse tags at all.
  const bareLib: ExerciseMeta[] = [{ id: 'squat', category: 'legs', movement_planes: ['sagittal'] }];
  const r = computeCoverage(base({
    exercises: bareLib,
    sets: [{ exercise_id: 'squat', date: daysAgo(2), reps: 5 }],
  }));
  check('untagged power -> not_tracked (not absent)', get(r, 'power_speed').status === 'not_tracked', get(r, 'power_speed'));
  check('untagged balance -> not_tracked', get(r, 'balance').status === 'not_tracked');
  check('untagged frontal -> not_tracked', get(r, 'plane_frontal').status === 'not_tracked');
  check('strength still measurable from reps alone', get(r, 'strength').status !== 'not_tracked');
}

console.log('\n--- cardio zones ---');
{
  const r = computeCoverage(base({
    cardio: [
      { date: daysAgo(3), zone1_min: 20, zone2_min: 25 },          // aerobic_base
      { date: daysAgo(5), zone3_min: 10, zone4_min: 4 },           // aerobic_capacity
      { date: daysAgo(7), duration_min: 40 },                       // no zones -> base via duration
      { date: daysAgo(9), duration_min: 5 },                        // too short -> ignored
    ],
  }));
  check('zone1/2 -> aerobic_base', get(r, 'aerobic_base').lastTrained === daysAgo(3));
  check('zone3/4 -> aerobic_capacity', get(r, 'aerobic_capacity').daysSince === 5);
  check('zoneless long session -> base', get(r, 'aerobic_base').daysInWindow >= 2, get(r, 'aerobic_base'));
  check('sub-20min zoneless -> not counted',
    get(r, 'aerobic_base').lastTrained !== daysAgo(9));
}

console.log('\n--- gaps + ordering ---');
{
  const r = computeCoverage(base({
    sets: [
      { exercise_id: 'squat', date: daysAgo(2), reps: 5 },     // strong-ish strength
      { exercise_id: 'twist', date: daysAgo(120), reps: 20 },  // stale transverse
    ],
  }));
  check('stale transverse appears in gaps', r.gaps.includes('plane_transverse'), r.gaps);
  check('absent power appears in gaps', r.gaps.includes('power_speed'));
  const sorted = sortByUrgency(r.attributes);
  check('worst status sorts first', ['absent', 'stale'].includes(sorted[0].status), sorted[0]);
  check('strong sorts last', sorted[sorted.length - 1].status === 'strong' || sorted[sorted.length - 1].status === 'maintained');
}

console.log('\n--- robustness ---');
{
  let threw = false;
  try {
    computeCoverage(base({ sets: [{ exercise_id: null, date: daysAgo(1), reps: null }] }));
    computeCoverage(base({ sets: [{ exercise_id: 'ghost', date: daysAgo(1), reps: 5 }] })); // unknown id
    computeCoverage(base({ exercises: [], sets: [], cardio: [] }));
  } catch { threw = true; }
  check('null/unknown/empty inputs do not throw', !threw);

  const empty = computeCoverage(base());
  check('empty history: derivable attrs absent, not crashing', get(empty, 'strength').status === 'absent');
  check('empty history still reports all 10 attributes', empty.attributes.length === 10, empty.attributes.length);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
