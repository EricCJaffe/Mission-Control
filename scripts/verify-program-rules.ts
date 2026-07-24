/* Verification harness for program-rules.ts — run with: npx tsx <this file> */
import {
  parseRepRange,
  checkSeventyTwoHourRule,
  checkThreeToFiveRule,
  checkProgressiveOverload,
  checkPushPullBalance,
  checkProximityToFailure,
  checkFiveFourThreeTwoOne,
  deriveProgrammedFrequency,
  validateProgram,
  type ProgramPlan,
  type PlannedDay,
} from '../src/lib/fitness/program-rules';
import {
  normalizeGoal,
  toProgramPlan,
  validateGeneratedPlan,
} from '../src/lib/fitness/plan-validation';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

console.log('\n--- parseRepRange ---');
check('"8-10" -> 8..10', JSON.stringify(parseRepRange('8-10')) === '{"min":8,"max":10}');
check('"5" -> 5..5', JSON.stringify(parseRepRange('5')) === '{"min":5,"max":5}');
check('number 12 -> 12..12', JSON.stringify(parseRepRange(12)) === '{"min":12,"max":12}');
check('en-dash "3–5" parses', JSON.stringify(parseRepRange('3–5')) === '{"min":3,"max":5}');
check('"8 to 12" parses', JSON.stringify(parseRepRange('8 to 12')) === '{"min":8,"max":12}');
check('reversed "10-8" normalises', JSON.stringify(parseRepRange('10-8')) === '{"min":8,"max":10}');
check('"AMRAP" -> null', parseRepRange('AMRAP') === null);
check('"to failure" -> null', parseRepRange('to failure') === null);
check('"30s" -> null (time-based)', parseRepRange('30s') === null);
check('"45 sec" -> null', parseRepRange('45 sec') === null);
check('"20 min" -> null', parseRepRange('20 min') === null);
check('undefined -> null', parseRepRange(undefined) === null);
check('"" -> null', parseRepRange('') === null);
check('garbage -> null', parseRepRange('heavy') === null);
check('0 -> null', parseRepRange(0) === null);

console.log('\n--- 72-hour rule (circular gap) ---');
const mk = (day: number, muscles: string[][]): PlannedDay => ({
  day_number: day,
  day_label: `Day ${day}`,
  exercises: muscles.map((m, i) => ({ exercise_name: `ex${day}-${i}`, sets: 3, muscle_groups: m })),
});

// Mon + Thu = gaps of 3 and 4 -> the 4 wraps, so this SHOULD fail.
const monThu: ProgramPlan = { goal: 'hypertrophy', weekly_template: [mk(1, [['chest']]), mk(4, [['chest']])] };
const monThuF = checkSeventyTwoHourRule(monThu);
check('Mon+Thu chest flags (max gap 4)', monThuF.length === 1 && /4 days/.test(monThuF[0].summary), monThuF);

// Mon + Thu + Sun = gaps 3,3,1 -> passes.
const monThuSun: ProgramPlan = { goal: 'hypertrophy', weekly_template: [mk(1, [['chest']]), mk(4, [['chest']]), mk(7, [['chest']])] };
check('Mon+Thu+Sun chest passes', checkSeventyTwoHourRule(monThuSun).length === 0, checkSeventyTwoHourRule(monThuSun));

// Day 6 + day 2: circular gap is 3 (6->2 wraps) and 4 (2->6). Should flag the 4.
const wrap: ProgramPlan = { goal: 'hypertrophy', weekly_template: [mk(2, [['back']]), mk(6, [['back']])] };
const wrapF = checkSeventyTwoHourRule(wrap);
check('wrap-around gap computed circularly', wrapF.length === 1 && /4 days/.test(wrapF[0].summary), wrapF);

// Trained once -> full week gap.
const once: ProgramPlan = { goal: 'hypertrophy', weekly_template: [mk(3, [['calves']])] };
const onceF = checkSeventyTwoHourRule(once);
check('single exposure flags 7-day gap', onceF.length === 1 && /7 days/.test(onceF[0].summary), onceF);

// No muscle data -> warning, not silent pass.
const noMuscle: ProgramPlan = { goal: 'hypertrophy', weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'x', sets: 3 }] }] };
const nmF = checkSeventyTwoHourRule(noMuscle);
check('missing muscle data warns rather than passing', nmF.length === 1 && nmF[0].severity === 'warning', nmF);

// resolveMuscleGroups fallback works.
const resolved = checkSeventyTwoHourRule(noMuscle, { resolveMuscleGroups: () => ['chest'] });
check('resolveMuscleGroups fallback used', resolved.length === 1 && /chest/.test(resolved[0].summary), resolved);

console.log('\n--- 3-to-5 rule ---');
const strengthDay = (d: number): PlannedDay => ({
  day_number: d,
  day_label: `S${d}`,
  exercises: [
    { exercise_name: 'Squat', sets: 4, target_reps: '3-5', rest_seconds: 240 },
    { exercise_name: 'Bench', sets: 3, target_reps: '5', rest_seconds: 200 },
    { exercise_name: 'Row', sets: 3, target_reps: '5', rest_seconds: 180 },
  ],
});
const goodStrength: ProgramPlan = {
  goal: 'strength',
  weeks: 4,
  weekly_template: [strengthDay(1), strengthDay(3), strengthDay(5)],
  progression: { mechanisms: ['load', 'reps'], cadence_weeks: 2 },
};
check('compliant strength plan yields no 3-5 findings', checkThreeToFiveRule(goodStrength).length === 0, checkThreeToFiveRule(goodStrength));

const tooFewDays: ProgramPlan = { ...goodStrength, weekly_template: [strengthDay(1), strengthDay(3)] };
check('2 days flags as error', checkThreeToFiveRule(tooFewDays).some(f => f.rule === '3-5-days' && f.severity === 'error'));

const highReps: ProgramPlan = {
  goal: 'strength',
  weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'Curl', sets: 3, target_reps: '12', rest_seconds: 200 }] }, strengthDay(3), strengthDay(5)],
};
check('12 reps flags as error in strength', checkThreeToFiveRule(highReps).some(f => f.rule === '3-5-reps' && f.severity === 'error'));

const timeBased: ProgramPlan = {
  goal: 'strength',
  weekly_template: [
    { day_number: 1, exercises: [{ exercise_name: 'Carry', sets: 3, target_reps: '30s', rest_seconds: 200 }] },
    strengthDay(3), strengthDay(5),
  ],
};
check('time-based prescription is skipped, not failed', !checkThreeToFiveRule(timeBased).some(f => f.rule === '3-5-reps'), checkThreeToFiveRule(timeBased));

const shortRest: ProgramPlan = {
  goal: 'strength',
  weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'Squat', sets: 3, target_reps: '5', rest_seconds: 60 }] }, strengthDay(3), strengthDay(5)],
};
check('60s rest flags', shortRest && checkThreeToFiveRule(shortRest).some(f => f.rule === '3-5-rest'));

console.log('\n--- progressive overload ---');
check('missing progression is an error',
  checkProgressiveOverload({ goal: 'hypertrophy', weekly_template: [] }).some(f => f.severity === 'error'));
check('load-only warns',
  checkProgressiveOverload({ goal: 'strength', weekly_template: [], progression: { mechanisms: ['load'], cadence_weeks: 2 } })
    .some(f => /only progression mechanism/.test(f.summary)));
check('load+reps at 2wk is clean',
  checkProgressiveOverload({ goal: 'strength', weeks: 4, weekly_template: [], progression: { mechanisms: ['load', 'reps'], cadence_weeks: 2 } }).length === 0);
check('cadence 5wk warns',
  checkProgressiveOverload({ goal: 'strength', weekly_template: [], progression: { mechanisms: ['load', 'reps'], cadence_weeks: 5 } })
    .some(f => /every 5 weeks/.test(f.summary)));
check('8wk block without deload warns',
  checkProgressiveOverload({ goal: 'strength', weeks: 8, weekly_template: [], progression: { mechanisms: ['load', 'reps'], cadence_weeks: 2 } })
    .some(f => f.rule === 'deload'));
check('8wk block WITH deload is clean',
  checkProgressiveOverload({ goal: 'strength', weeks: 8, deload_weeks: [4, 8], weekly_template: [], progression: { mechanisms: ['load', 'reps'], cadence_weeks: 2 } }).length === 0);

console.log('\n--- push/pull balance ---');
const pressOnly: ProgramPlan = {
  goal: 'hypertrophy',
  weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'Bench', sets: 4, category: 'push' }] }],
};
check('press-only is an error', checkPushPullBalance(pressOnly).some(f => f.severity === 'error'));
const balanced: ProgramPlan = {
  goal: 'hypertrophy',
  weekly_template: [{ day_number: 1, exercises: [
    { exercise_name: 'Bench', sets: 4, category: 'push' },
    { exercise_name: 'Row', sets: 4, category: 'pull' },
  ] }],
};
check('balanced week is clean', checkPushPullBalance(balanced).length === 0);
const cardioOnly: ProgramPlan = {
  goal: 'endurance',
  weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'Run', sets: 1, category: 'cardio' }] }],
};
check('cardio-only produces no push/pull finding', checkPushPullBalance(cardioOnly).length === 0);

console.log('\n--- proximity to failure ---');
check('no RIR anywhere warns',
  checkProximityToFailure({ goal: 'hypertrophy', weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'a', sets: 3 }] }] })
    .some(f => f.severity === 'warning'));
check('RIR 6 is an error',
  checkProximityToFailure({ goal: 'hypertrophy', weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'a', sets: 3, rir: 6 }] }] })
    .some(f => f.severity === 'error'));
check('RIR 2 is clean',
  checkProximityToFailure({ goal: 'hypertrophy', weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'a', sets: 3, rir: 2 }] }] }).length === 0);
check('empty plan produces nothing',
  checkProximityToFailure({ goal: 'hypertrophy', weekly_template: [] }).length === 0);

console.log('\n--- 5-4-3-2-1 ---');
const fatLossGood: ProgramPlan = {
  goal: 'fat_loss',
  weekly_template: [1, 2, 3, 4].map(d => ({ day_number: d, exercises: [{ exercise_name: 'x', sets: 3 }] })),
  weekly_activity: { active_days: 5, sweat_days: 3, hard_days: 2, long_days: 1 },
};
check('compliant 5-4-3-2-1 is clean', checkFiveFourThreeTwoOne(fatLossGood).length === 0, checkFiveFourThreeTwoOne(fatLossGood));
const fatLossThin: ProgramPlan = {
  goal: 'fat_loss',
  weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'x', sets: 3 }] }],
  weekly_activity: { active_days: 2, sweat_days: 0, hard_days: 0, long_days: 0 },
};
check('thin week produces multiple errors', checkFiveFourThreeTwoOne(fatLossThin).filter(f => f.severity === 'error').length >= 3);
const fatLossUnspecified: ProgramPlan = { goal: 'fat_loss', weekly_template: [{ day_number: 1, exercises: [{ exercise_name: 'x' }] }] };
check('unspecified activity is info, never error',
  checkFiveFourThreeTwoOne(fatLossUnspecified).filter(f => ['5-active', '3-sweat', '1-long'].includes(f.rule)).every(f => f.severity === 'info'));

console.log('\n--- frequency realism ---');
const noHistory = deriveProgrammedFrequency(5, null);
check('no history -> stated minus one', noHistory.programmed === 4 && noHistory.adjusted);
const lowCompliance = deriveProgrammedFrequency(5, 3.2);
check('stated 5, observed 3.2 -> programmed 3', lowCompliance.programmed === 3 && lowCompliance.adjusted, lowCompliance);
const goodCompliance = deriveProgrammedFrequency(4, 4.6);
check('observed exceeds stated -> honour stated, not adjusted', goodCompliance.programmed === 4 && !goodCompliance.adjusted);
check('never programs below minimum', deriveProgrammedFrequency(3, 0.2).programmed === 1);
check('stated is a ceiling', deriveProgrammedFrequency(3, 9).programmed === 3);
check('reason always explains the adjustment', lowCompliance.reason.includes('3.2') && lowCompliance.reason.includes('deliberate'));

console.log('\n--- validateProgram dispatcher ---');
const report = validateProgram(goodStrength);
check('good strength plan passes', report.passed, report.findings);
check('checksPassed is populated', report.checksPassed.length > 0, report.checksPassed);
const badReport = validateProgram({ goal: 'hypertrophy', weeks: 8, weekly_template: [mk(1, [['chest']])] });
check('bad hypertrophy plan fails', !badReport.passed);
check('errors sort before warnings', badReport.findings[0].severity === 'error', badReport.findings.map(f => f.severity));
check('fat_loss goal does not run 3-5 rules',
  !validateProgram(fatLossGood).findings.some(f => f.rule.startsWith('3-5-')));
check('hypertrophy goal does not run 3-5 rules',
  !validateProgram({ goal: 'hypertrophy', weekly_template: [mk(1, [['chest']])] }).findings.some(f => f.rule.startsWith('3-5-')));
check('hybrid runs both families',
  (() => {
    const r = validateProgram({ goal: 'hybrid', weekly_template: [mk(1, [['chest']])] });
    return r.findings.some(f => f.rule === '72-hour') && r.findings.some(f => f.rule.startsWith('3-5-'));
  })());

console.log('\n--- plan-validation adapter (raw model output -> ProgramPlan) ---');

const EXERCISE_LIB = [
  { id: 'ex-bench', name: 'Bench Press', category: 'push', muscle_groups: ['chest', 'triceps'], is_compound: true },
  { id: 'ex-row', name: 'Barbell Row', category: 'pull', muscle_groups: ['back', 'biceps'], is_compound: true },
];

check('normalizeGoal: exact match', normalizeGoal('strength') === 'strength');
check('normalizeGoal: "Fat Loss" -> fat_loss', normalizeGoal('Fat Loss') === 'fat_loss');
check('normalizeGoal: "muscle size" -> hypertrophy', normalizeGoal('muscle size') === 'hypertrophy');
check('normalizeGoal: unknown -> hybrid (conservative)', normalizeGoal('vibes') === 'hybrid');
check('normalizeGoal: null -> hybrid', normalizeGoal(null) === 'hybrid');

// Muscle groups absent from model output must be resolved from the library,
// otherwise the 72-hour rule silently degrades to "cannot verify".
const libResolved = toProgramPlan(
  { weekly_template: [{ day_number: 1, exercises: [{ exercise_id: 'ex-bench', exercise_name: 'Bench Press', sets: 3 }] }] },
  { goal: 'hypertrophy', weeks: 4, exercises: EXERCISE_LIB }
);
check('muscle groups resolved from exercise library',
  libResolved.weekly_template[0].exercises?.[0].muscle_groups?.includes('chest') === true,
  libResolved.weekly_template[0].exercises?.[0]);
check('category resolved from library', libResolved.weekly_template[0].exercises?.[0].category === 'push');

// Missing day_number must not collapse every day onto the same index.
const noDayNumbers = toProgramPlan(
  { weekly_template: [{ exercises: [{ exercise_name: 'A' }] }, { exercises: [{ exercise_name: 'B' }] }] },
  { goal: 'strength' }
);
check('missing day_number falls back to position',
  noDayNumbers.weekly_template.map(d => d.day_number).join(',') === '1,2',
  noDayNumbers.weekly_template.map(d => d.day_number));

// Free-text progression_notes must NOT satisfy the structured overload rule.
const prose = toProgramPlan(
  { weekly_template: [], progression_notes: 'Add a bit of weight each week' },
  { goal: 'strength' }
);
check('prose progression_notes does not count as declared progression', prose.progression === undefined);
check('...and therefore still fails the overload rule',
  validateProgram(prose).findings.some(f => f.rule === 'progressive-overload' && f.severity === 'error'));

const structured = toProgramPlan(
  { weekly_template: [], progression: { mechanisms: ['load', 'reps'], cadence_weeks: 2 } },
  { goal: 'strength' }
);
check('structured progression is accepted', structured.progression?.mechanisms.length === 2);

// Unknown mechanisms are dropped rather than trusted.
const bogus = toProgramPlan(
  { weekly_template: [], progression: { mechanisms: ['load', 'vibes', 'Range Of Motion'], cadence_weeks: 2 } },
  { goal: 'strength' }
);
check('unknown mechanisms dropped, known ones normalised',
  JSON.stringify(bogus.progression?.mechanisms) === '["load","range_of_motion"]', bogus.progression);

// Malformed input must not throw — the model can return anything.
let threw = false;
try {
  toProgramPlan({ weekly_template: 'not an array', deload_weeks: 'nope', progression: 5 } as never, { goal: 'strength' });
  toProgramPlan({}, { goal: undefined });
  toProgramPlan({ weekly_template: [null, 3, { exercises: [null, 'x'] }] } as never, { goal: 'strength' });
} catch { threw = true; }
check('malformed model output does not throw', !threw);

// Exercises with neither id nor name are dropped, not turned into ghosts.
const ghosts = toProgramPlan(
  { weekly_template: [{ day_number: 1, exercises: [{ sets: 3 }, { exercise_name: 'Real' }] }] },
  { goal: 'strength' }
);
check('nameless exercises dropped', ghosts.weekly_template[0].exercises?.length === 1);

// String numerics from the model are coerced.
const stringy = toProgramPlan(
  { weekly_template: [{ day_number: '2', exercises: [{ exercise_name: 'A', sets: '4', rest_seconds: '180', rir: '2' }] }] },
  { goal: 'strength' }
);
const sEx = stringy.weekly_template[0].exercises?.[0];
check('numeric strings coerced', stringy.weekly_template[0].day_number === 2 && sEx?.sets === 4 && sEx?.rir === 2, sEx);

// End-to-end: a realistic bad plan produces actionable findings.
const e2e = validateGeneratedPlan(
  {
    goal: 'hypertrophy',
    weekly_template: [
      { day_number: 1, day_label: 'Push', exercises: [{ exercise_id: 'ex-bench', sets: 4, target_reps: '8-10', rir: 2 }] },
    ],
    progression_notes: 'get stronger',
  },
  { goal: 'hypertrophy', weeks: 8, exercises: EXERCISE_LIB }
);
check('e2e: bad plan fails', !e2e.report.passed);
check('e2e: flags 72-hour gap', e2e.report.findings.some(f => f.rule === '72-hour'));
check('e2e: flags missing progression', e2e.report.findings.some(f => f.rule === 'progressive-overload'));
check('e2e: flags push-only imbalance', e2e.report.findings.some(f => f.rule === 'push-pull-balance'));
check('e2e: every finding carries a remedy', e2e.report.findings.every(f => f.remedy.length > 10));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
