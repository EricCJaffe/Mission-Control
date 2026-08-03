#!/usr/bin/env node
/**
 * Seeds a 12-week couch-to-5K progression built from Eric's actual baseline.
 *
 * Baseline (2026-08-03, synced from Apple Health): 60 min on feet, 3.78 mi
 * total, of which ~1.1 mi was continuous running at ~13:30/mi. So the aerobic
 * base is already an hour — the limiter is continuous running time, and that
 * is what the progression targets.
 *
 * Goal: 3.1 mi continuous at 13:00/mi (~40 min unbroken).
 *
 * Structure, three sessions a week:
 *   Tue — Norwegian 4x4 (his request): alternating 4 min jog / 4 min walk
 *   Thu — Zone 2 easy: conversational, builds time on feet
 *   Sat — Progression: the key session, extends the longest continuous run
 *
 * Week 1's progression session IS the run already completed on the start date,
 * so the plan begins from real work rather than asking him to repeat it.
 *
 * Surfaces alternate outdoor / treadmill through the block, per his usual
 * rotation. Treadmill lands on the interval session where holding a steady jog
 * is easier, outdoor on the progression where the distance is the point.
 *
 * Deloads in weeks 4 and 8. The Saturday build averages ~10%/week, which is
 * the conventional ceiling for running volume and matters more than usual
 * here: post-CABG, EF 36%, so the plan is deliberately conservative and every
 * session is capped by RPE rather than pace.
 *
 * Usage: node --env-file=.env.local scripts/seed-running-plan.ts
 */

import { createClient } from '@supabase/supabase-js';

const U = process.env.PLAN_USER_ID ?? '96982dec-d682-4dd0-9498-1d2d226dab83';
const START = process.env.PLAN_START ?? '2026-08-03'; // a Monday

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** Longest continuous run for each week's Saturday session, in miles. */
const SATURDAY_MILES = [1.1, 1.25, 1.4, 1.2, 1.6, 1.8, 2.0, 1.6, 2.3, 2.6, 2.9, 3.1];
/** Jog interval length for the Tuesday 4x4-style session, minutes. */
const TUESDAY_JOG_MIN = [4, 4, 4, 4, 5, 5, 5, 4, 6, 6, 7, 4];
/** Zone-2 session duration, minutes. */
const THURSDAY_MIN = [35, 38, 40, 35, 42, 45, 45, 38, 48, 50, 50, 30];

const DELOAD_WEEKS = new Set([4, 8]);

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

type Session = {
  week: number;
  date: string;
  label: string;
  type: string;
  prescribed: Record<string, unknown>;
  notes: string;
};

function buildSessions(): Session[] {
  const out: Session[] = [];

  for (let week = 1; week <= 12; week++) {
    const weekStart = addDays(START, (week - 1) * 7);
    const deload = DELOAD_WEEKS.has(week);
    const jog = TUESDAY_JOG_MIN[week - 1];
    const miles = SATURDAY_MILES[week - 1];
    const easyMin = THURSDAY_MIN[week - 1];

    // Tuesday — Norwegian 4x4 style
    const rounds = week === 12 ? 3 : 4;
    out.push({
      week,
      date: addDays(weekStart, 1),
      label: `Norwegian 4x4 — ${jog} min jog / 4 min walk (${week % 2 === 1 ? 'treadmill' : 'outdoor'})`,
      type: 'Interval Run',
      prescribed: {
        format: 'norwegian_4x4',
        warmup_min: 6,
        rounds,
        work_min: jog,
        recover_min: 4,
        cooldown_min: 6,
        surface: week % 2 === 1 ? 'treadmill' : 'outdoor',
        total_min: 6 + rounds * (jog + 4) + 6,
        target_effort: 'RPE 6-7 on the jog — hard but you could still speak a short sentence',
      },
      notes:
        `${rounds} rounds of ${jog} min jog / 4 min walk, 6 min warm-up and cool-down. ` +
        `Jog effort RPE 6-7. If you can't say a short sentence, slow down — pace is the ` +
        `output, not the target.`,
    });

    // Thursday — Zone 2
    out.push({
      week,
      date: addDays(weekStart, 3),
      label: `Zone 2 easy — ${easyMin} min (${week % 2 === 1 ? 'outdoor' : 'treadmill'})`,
      type: 'Zone 2 Run',
      prescribed: {
        format: 'zone2',
        total_min: easyMin,
        surface: week % 2 === 1 ? 'outdoor' : 'treadmill',
        target_effort: 'RPE 3-4, full conversation possible throughout',
        method: 'Run/walk freely. Time on feet is the goal, not continuous running.',
      },
      notes:
        `${easyMin} min easy. Full conversational effort the whole way — RPE 3-4. ` +
        `Walk whenever you need to; this session builds the aerobic base, not speed.`,
    });

    // Saturday — the progression run. Week 1 is anchored to the start date
    // because that run has already happened.
    const isTest = week === 12;
    out.push({
      week,
      date: week === 1 ? START : addDays(weekStart, 5),
      label: isTest
        ? '5K TEST — 3.1 mi continuous (outdoor)'
        : `Progression — ${miles} mi continuous${deload ? ' (deload)' : ''} (outdoor)`,
      type: isTest ? '5K Test' : 'Progression Run',
      prescribed: {
        format: isTest ? 'time_trial' : 'progression',
        warmup_min: 8,
        surface: 'outdoor',
        continuous_miles: miles,
        target_pace_min_per_mile: 13.0,
        cooldown_min: 8,
        target_effort: isTest
          ? 'RPE 7-8. Even pace, finish strong.'
          : 'RPE 5-6. Continuous is the point — slow down rather than stop.',
      },
      notes: week === 1
        ? `Already done — 60 min out, 3.78 mi total, ~1.1 mi of it continuous at ` +
          `~13:30/mi, HR 122 avg / 149 max. This is the baseline everything else ` +
          `is measured against.`
        : isTest
        ? `The goal: 3.1 mi without stopping at ~13:00/mi (about 40 min). 8 min walk ` +
          `warm-up, then run. Even effort — do not start fast.`
        : `Run ${miles} mi continuously at whatever pace keeps you running. ${
            deload ? 'Deload week — this is deliberately easier than last week. ' : ''
          }Walk 8 min either side. If you have to stop, note where and we adjust.`,
    });
  }

  return out;
}

const sessions = buildSessions();
const endDate = addDays(START, 12 * 7 - 1);

// —— Plan ——
const { data: existing } = await supabase
  .from('training_plans')
  .select('id')
  .eq('user_id', U)
  .eq('name', 'Couch to 5K — Run 3.1 Continuous')
  .maybeSingle();

if (existing) {
  await supabase.from('planned_workouts').delete().eq('plan_id', existing.id);
  await supabase.from('training_plans').delete().eq('id', existing.id);
  console.log('replaced the previous run of this plan');
}

const { data: plan, error: planError } = await supabase
  .from('training_plans')
  .insert({
    user_id: U,
    name: 'Couch to 5K — Run 3.1 Continuous',
    start_date: START,
    end_date: endDate,
    cycle_weeks: 12,
    plan_type: 'running',
    discipline: 'cardio',
    status: 'active',
    ai_generated: false,
    config: {
      goal: 'Run 5K (3.1 mi) continuously at ~13:00/mi',
      baseline: {
        date: '2026-08-03',
        session_minutes: 60,
        total_miles: 3.78,
        continuous_run_miles: 1.1,
        continuous_run_pace: '~13:30/mi',
        avg_hr: 122,
        max_hr: 149,
      },
      days: ['Tuesday', 'Thursday', 'Saturday'],
      flexible_scheduling: true,
      deload_weeks: [4, 8],
      medical_note:
        'Post-CABG, LVEF 36% (MRI 2026-03-03). Progression is deliberately conservative ' +
        'and effort-capped by RPE rather than pace. Clear with Dr. Chandler on 2026-08-26 ' +
        'before the later weeks.',
    },
    weekly_template: {
      tuesday: 'Norwegian 4x4 intervals',
      thursday: 'Zone 2 easy',
      saturday: 'Progression run (longest continuous)',
    },
    notes:
      'Days are placeholders — move any session within its week. The Saturday progression ' +
      'is the one that matters; the other two support it.',
  })
  .select('id')
  .single();

if (planError || !plan) {
  console.error('plan insert failed:', planError?.message);
  process.exit(1);
}

const rows = sessions.map((s) => ({
  user_id: U,
  plan_id: plan.id,
  scheduled_date: s.date,
  week_number: s.week,
  day_label: s.label,
  workout_type: s.type,
  prescribed: s.prescribed,
  notes: s.notes,
  status: 'pending',
}));

const { error: sessionError } = await supabase.from('planned_workouts').insert(rows);
if (sessionError) {
  console.error('sessions insert failed:', sessionError.message);
  process.exit(1);
}

console.log(`plan created: ${START} → ${endDate}, ${rows.length} sessions`);
for (const week of [1, 4, 8, 12]) {
  console.log(`  week ${week}:`);
  sessions.filter((s) => s.week === week).forEach((s) => console.log(`    ${s.date}  ${s.label}`));
}
