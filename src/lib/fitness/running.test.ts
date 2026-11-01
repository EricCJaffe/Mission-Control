/*
 * Running plan, activity upload and scoring. All data here is synthetic: a
 * made-up plan and made-up runs, never anyone's real export.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easternToIso,
  fingerprint,
  fitAscentFt,
  formatOf,
  isRun,
  isRunLike,
  mapFitData,
  paceLabel,
  parseDuration,
  parseGarminCsv,
  parseGpx,
  sameActivity,
  zonePct,
} from './activity-files.ts';
import { planWeeks, validateRunningPlan, weekFor, type RunningPlan } from './running-plan.ts';
import { encouragement, scoreSession, summarize, type RunSession } from './running-score.ts';

const PLAN: RunningPlan = {
  version: 1,
  name: 'Sample 10K',
  start_date: '2030-01-07',
  race: { name: 'Sample 10K', date: '2030-03-02', distance_mi: 6.2 },
  rules: { hr_ceiling: 150, z2_low: 110, z2_high: 130, notes: ['Easy means conversational.'] },
  phases: [
    { name: 'Base', start: '2030-01-07', end: '2030-02-03', runs_per_week: 3, long_run_start_mi: 2, long_run_end_mi: 4, intensity: 'Z2', deload_weeks: ['2030-01-30'] },
    { name: 'Build', start: '2030-02-04', end: '2030-02-24', runs_per_week: 3, long_run_start_mi: 4, long_run_end_mi: 6, intensity: 'Z2 plus strides', needs_clearance: 'strides' },
    { name: 'Race', start: '2030-02-25', end: '2030-03-02', runs_per_week: 2, long_run_start_mi: null, long_run_end_mi: null, intensity: 'Easy' },
  ],
  milestones: [{ id: 'four', label: 'Four by February', distance_mi: 4, by: '2030-02-01' }],
};

const GPX = `<?xml version="1.0"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <trk><name>Morning Run</name><type>running</type><trkseg>
  <trkpt lat="30.3300" lon="-81.6600"><ele>10</ele><time>2030-01-08T12:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>112</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="30.3390" lon="-81.6600"><ele>16</ele><time>2030-01-08T12:06:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>125</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  <trkpt lat="30.3480" lon="-81.6600"><ele>13</ele><time>2030-01-08T12:12:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>141</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
 </trkseg></trk>
</gpx>`;

const CSV = `\uFEFFActivity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Total Ascent
Running,2030-01-08 07:00:00,false,Morning Run,1.24,150,00:12:00,126,141,40
Strength Training,2030-01-09 18:00:00,false,Lift,0.00,200,00:40:00,95,120,--
Running,2030-01-10 06:30:00,false,Easy,"2.00",210,0:24:30,--,--,--
`;

test('format detection and run detection', () => {
  assert.equal(formatOf('Activity_123.FIT'), 'fit');
  assert.equal(formatOf('run.gpx'), 'gpx');
  assert.equal(formatOf('Activities.csv'), 'csv');
  assert.equal(formatOf('notes.txt'), null);
  assert.ok(isRun('Treadmill Running'));
  assert.ok(isRun('running'));
  assert.ok(!isRun('Strength Training'));
  assert.ok(isRunLike('Other'));
  assert.ok(isRunLike('Walking'));
  assert.ok(isRunLike(''));
  assert.ok(!isRunLike('Road Cycling'));
  assert.ok(!isRunLike('Strength Training'));
  assert.equal(fitAscentFt(0.0341), 180);
  assert.equal(fitAscentFt(55), 180);
  assert.equal(fitAscentFt(undefined), null);
});

test('GPX: distance, duration, HR and local date', () => {
  const [a] = parseGpx(GPX);
  assert.equal(a.format, 'gpx');
  assert.equal(a.sport, 'running');
  assert.equal(a.title, 'Morning Run');
  assert.equal(a.durationSec, 720);
  assert.ok(Math.abs(a.distanceMi - 1.24) < 0.02, `distance ${a.distanceMi}`);
  assert.equal(a.avgHr, 126);
  assert.equal(a.maxHr, 141);
  assert.equal(a.date, '2030-01-08');
  assert.deepEqual(a.hrSamples, [112, 125, 141]);
  assert.equal(a.gainFt, 20); // +6 m, then down
  assert.equal(a.kcal, null);
  assert.deepEqual(parseGpx('<gpx></gpx>'), []);
});

test('Garmin CSV: rows, durations, missing HR and Eastern start times', () => {
  const rows = parseGarminCsv(CSV);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].startTime, '2030-01-08T12:00:00.000Z');
  assert.equal(rows[0].durationSec, 720);
  assert.equal(rows[2].distanceMi, 2);
  assert.equal(rows[2].durationSec, 1470);
  assert.equal(rows[2].avgHr, null);
  assert.equal(rows[2].maxHr, null);
  assert.equal(rows[0].gainFt, 40);
  assert.equal(rows[0].kcal, 150);
  assert.equal(rows[2].gainFt, null);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('24:31.4'), 1471);
  assert.equal(parseDuration('n/a'), 0);
  // Summer time is UTC-4, winter UTC-5.
  assert.equal(easternToIso('2030-07-01 07:00:00'), '2030-07-01T11:00:00.000Z');
});

test('FIT: sessions mapped, HR samples limited to the session window', () => {
  const [a] = mapFitData({
    sessions: [{ sport: 'running', start_time: '2030-01-08T12:00:00Z', total_timer_time: 720, total_elapsed_time: 730, total_distance: 1.238, total_ascent: 0.01, total_calories: 140, avg_heart_rate: 126.4, max_heart_rate: 141 }],
    records: [
      { timestamp: '2030-01-08T11:59:00Z', heart_rate: 90 },
      { timestamp: '2030-01-08T12:01:00Z', heart_rate: 120 },
      { timestamp: '2030-01-08T12:10:00Z', heart_rate: 128 },
    ],
  });
  assert.equal(a.distanceMi, 1.24);
  assert.equal(a.durationSec, 720);
  assert.equal(a.avgHr, 126);
  assert.deepEqual(a.hrSamples, [120, 128]);
  assert.equal(a.gainFt, 53);
  assert.equal(a.kcal, 140);
  assert.deepEqual(mapFitData({}), []);
});

test('dedupe: the same run in two formats matches; a different run does not', () => {
  const [gpx] = parseGpx(GPX);
  const [csv] = parseGarminCsv(CSV);
  assert.ok(sameActivity(gpx, { date: csv.date, distanceMi: csv.distanceMi, durationSec: csv.durationSec }));
  assert.ok(!sameActivity(gpx, { date: '2030-01-08', distanceMi: 2.0, durationSec: 720 }));
  assert.ok(!sameActivity(gpx, { date: '2030-01-08', distanceMi: null, durationSec: 720 }));
  assert.equal(fingerprint(gpx), fingerprint({ ...gpx }));
  assert.notEqual(fingerprint(gpx), fingerprint({ ...gpx, durationSec: 721 }));
});

test('zone share and pace', () => {
  assert.equal(zonePct([112, 125, 141], 110, 130), 67);
  assert.equal(zonePct([], 110, 130), null);
  assert.equal(paceLabel(720, 1.2), '10:00');
  assert.equal(paceLabel(720, 0), null);
});

test('plan validation names what is wrong', () => {
  assert.ok(validateRunningPlan(PLAN).ok);
  const bad = validateRunningPlan({ version: 1, name: 'x', start_date: '2030-03-01', race: { name: 'r', date: '2030-01-01', distance_mi: 3 }, rules: {}, phases: [] });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.some((e) => e.includes('before start_date')));
    assert.ok(bad.errors.some((e) => e.includes('phases')));
  }
  assert.equal(validateRunningPlan(null).ok, false);
});

test('plan weeks: phases, long-run ramp, deload and race week', () => {
  const weeks = planWeeks(PLAN);
  assert.equal(weeks.length, 8);
  assert.deepEqual(weeks.map((w) => w.phase), ['Base', 'Base', 'Base', 'Base', 'Build', 'Build', 'Build', 'Race']);
  assert.equal(weeks[0].longRunMi, 2);
  assert.equal(weeks[3].deload, true);
  assert.equal(weeks[3].longRunMi, 3); // 4 mi ramp end, cut 30% -> 2.8 -> 3
  assert.equal(weeks[6].longRunMi, 6);
  assert.equal(weeks[7].longRunMi, null);
  assert.equal(weeks[7].raceWeek, true);
  assert.equal(weeks[4].needsClearance, 'strides');
  assert.equal(weekFor(weeks, '2030-01-15')?.index, 2);
  assert.equal(weekFor(weeks, '2029-12-31'), null);
});

const run = (date: string, mi: number, extra: Partial<RunSession> = {}): RunSession => ({
  date, distanceMi: mi, durationSec: Math.round(mi * 720), avgHr: 125, maxHr: 140, z2Pct: 85, feel: 7, notes: 'easy', ...extra,
});

test('session score: miles plus safety bonuses, missing inputs drop out', () => {
  const full = scoreSession(run('2030-01-08', 2), PLAN.rules);
  assert.equal(full.points, 20 + 15 + 10 + 5);
  assert.deepEqual(full.bonuses, ['Ceiling Keeper', 'Zone Master', 'Logged it']);
  const bare = scoreSession(run('2030-01-08', 2, { avgHr: null, maxHr: null, z2Pct: null, feel: null, notes: null }), PLAN.rules);
  assert.equal(bare.points, 20);
  const over = scoreSession(run('2030-01-08', 1, { maxHr: 160, notes: 'HR drift, smart stop' }), PLAN.rules);
  assert.deepEqual(over.bonuses, ['Zone Master', 'Logged it', 'Smart Stop']);
});

test('summary: weekly totals, streak, bonuses, badges and encouragement', () => {
  const weeks = planWeeks(PLAN);
  const sessions = [
    run('2030-01-08', 2), run('2030-01-10', 2), run('2030-01-12', 3.2),
    run('2030-01-15', 2), run('2030-01-17', 2), run('2030-01-19', 4),
    run('2030-01-22', 2, { maxHr: 155 }),
  ];
  const s = summarize(PLAN, weeks, sessions, '2030-01-23');
  assert.equal(s.current?.week.index, 3);
  assert.equal(s.weeks[0].miles, 7.2);
  assert.equal(s.weeks[0].complete, true);
  assert.equal(s.current?.overCeiling, true);
  assert.equal(s.streakWeeks, 2);
  assert.equal(s.totalMiles, 17.2);
  assert.equal(s.longestRunMi, 4);
  assert.equal(s.daysToRace, 38);
  const sessionPoints = sessions.reduce((a, x) => a + scoreSession(x, PLAN.rules).points, 0);
  assert.equal(s.totalPoints, sessionPoints + 2 * 20);
  const earned = Object.fromEntries(s.badges.map((b) => [b.id, b.earnedOn]));
  assert.equal(earned['day-one'], '2030-01-08');
  assert.equal(earned['first-5k'], '2030-01-12');
  assert.equal(earned['four'], '2030-01-19');
  assert.equal(earned['first-10k'], null);
  const lines = encouragement(s);
  assert.ok(lines.some((l) => l.includes('2 runs left')));
  assert.ok(lines.some((l) => l.includes('over the ceiling')));
});

// ---------------------------------------------------------------- seed parsing (synthetic)

import { parseDoc, parseRecommendations, parseSessions, section } from './running-seed.ts';

const SEED_MD = `# Request: sample

## (a) Plan
Something.

## (b) Session 1 log
| Date | Dist | Time | Pace | Avg HR | Max HR | Z1 | Z2 | Z3 | Z4 | Longest continuous run | Gain | kcal | Feel | Points |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2030-01-08 | 2.50 mi | 30:00 | 12:00/mi | 120 | 135 | 20% | 70% | 10% | 0% | ~12 min | ~60 ft | 250 | 7/10 | 40 |
Easy run-walk. No drift.

## (c) Coaching recommendations
1. Keep it easy.
2. Walk when HR reaches the top of zone 2.

## (d) Other
Not parsed.
`;

test('seed: session table row, notes line, recommendations and doc title', () => {
  assert.match(section(SEED_MD, 'b'), /^\| Date/);
  assert.equal(section(SEED_MD, 'z'), '');
  const [s] = parseSessions(SEED_MD);
  assert.deepEqual(s, {
    session_date: '2030-01-08', distance_mi: 2.5, duration_s: 1800, pace: '12:00',
    avg_hr: 120, max_hr: 135, z1_pct: 20, z2_pct: 70, z3_pct: 10, z4_pct: 0,
    longest_continuous_min: 12, gain_ft: 60, kcal: 250, feel: 7, points: 40,
    notes: 'Easy run-walk. No drift.',
  });
  assert.deepEqual(parseRecommendations(SEED_MD), [
    { ordinal: 1, text: 'Keep it easy.' },
    { ordinal: 2, text: 'Walk when HR reaches the top of zone 2.' },
  ]);
  assert.deepEqual(parseSessions('# nothing'), []);
  assert.deepEqual(parseDoc('# Access reference\nLast verified: never\n'), { title: 'Access reference', body: '# Access reference\nLast verified: never' });
});
