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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
