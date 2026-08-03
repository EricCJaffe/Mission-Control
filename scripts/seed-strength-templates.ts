#!/usr/bin/env node
/**
 * Rebuilds Eric's four strength templates to the split he actually runs.
 *
 * Replaces Upper Body Push, Push B - Overhead, Back and Bicep, and
 * Pull B - Rows + Legs. Bodyweight Circuit is left alone — he said it is right.
 *
 * Structure follows his description exactly: each day opens with a heavy pair
 * supersetted at 60 seconds rest, then a longer superset run continuously with
 * no rest. Pull B opens with pull-ups on their own before its superset.
 *
 * Reps are defaults, not prescriptions — he did not specify them, so compounds
 * get 8 and isolation work 12-15, and target weight is left null so the
 * carry-forward from last session fills it in rather than a made-up number.
 *
 * Usage: node --env-file=.env.local scripts/seed-strength-templates.ts
 */

import { createClient } from '@supabase/supabase-js';

const U = process.env.PLAN_USER_ID ?? '96982dec-d682-4dd0-9498-1d2d226dab83';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** Exercises his split needs that were not already in the library. */
const NEW_EXERCISES = [
  {
    name: 'Incline Dumbbell Fly',
    category: 'push', equipment: 'dumbbell',
    muscle_groups: ['chest', 'shoulders'], is_compound: false,
  },
  {
    name: 'Flat Dumbbell Fly',
    category: 'push', equipment: 'dumbbell',
    muscle_groups: ['chest'], is_compound: false,
  },
  {
    name: 'Front Dumbbell Raise',
    category: 'push', equipment: 'dumbbell',
    muscle_groups: ['shoulders'], is_compound: false,
  },
  {
    name: 'Overhead Tricep Press (Machine)',
    category: 'push', equipment: 'machine',
    muscle_groups: ['triceps'], is_compound: false,
  },
  {
    name: 'Ab Crunch (Machine)',
    category: 'core', equipment: 'machine',
    muscle_groups: ['abs'], is_compound: false,
  },
  {
    name: 'Seated Row (Machine)',
    category: 'pull', equipment: 'machine',
    muscle_groups: ['lats', 'mid-back', 'biceps'], is_compound: true,
  },
];

/** Templates to remove, by exact name. */
const REPLACE = [
  'Upper Body Push',
  'Push B - Overhead',
  'Back and Bicep',
  'Pull B - Rows + Legs',
];

type Ex = { reps: number; weight?: number | null };
type Plan = {
  name: string;
  splitType: string;
  minutes: number;
  notes: string;
  /** Opening single, if the day has one. */
  opener?: { exercise: string; sets: number; reps: number; rest: number };
  supersets: Array<{
    groupName: string;
    rounds: number;
    rest: number;
    exercises: Array<[string, Ex]>;
  }>;
};

const PLANS: Plan[] = [
  {
    name: 'Push A',
    splitType: 'push',
    minutes: 55,
    notes:
      'Heavy pair first with a minute between rounds, then the four-exercise block run continuously. ' +
      'Legs are paired into the push day deliberately so the upper-body work gets real rest without dead time.',
    supersets: [
      {
        groupName: 'Bench + Legs',
        rounds: 3,
        rest: 60,
        exercises: [
          ['Flat Barbell Bench Press', { reps: 8 }],
          ['Leg Press', { reps: 10 }],
        ],
      },
      {
        groupName: 'Continuous block',
        rounds: 3,
        rest: 0,
        exercises: [
          ['Incline Dumbbell Fly', { reps: 12 }],
          ['Hanging Knee Raise', { reps: 12 }],
          ['Tricep Pushdown (Cable)', { reps: 12 }],
          ['Front Dumbbell Raise', { reps: 12 }],
        ],
      },
    ],
  },
  {
    name: 'Push B',
    splitType: 'push',
    minutes: 55,
    notes:
      'Incline pressing paired with hamstrings, then the continuous block. ' +
      'Same shape as Push A with the angles and the leg movement changed.',
    supersets: [
      {
        groupName: 'Incline + Legs',
        rounds: 3,
        rest: 60,
        exercises: [
          ['Incline Barbell Bench Press', { reps: 8 }],
          ['Leg Curl (Machine)', { reps: 12 }],
        ],
      },
      {
        groupName: 'Continuous block',
        rounds: 3,
        rest: 0,
        exercises: [
          ['Flat Dumbbell Fly', { reps: 12 }],
          ['Overhead Tricep Press (Machine)', { reps: 12 }],
          ['Ab Crunch (Machine)', { reps: 15 }],
          ['Dumbbell Lateral Raise', { reps: 15 }],
        ],
      },
    ],
  },
  {
    name: 'Pull A',
    splitType: 'pull',
    minutes: 50,
    notes:
      'Pull-ups paired with trap bar deadlifts at a minute between rounds, then rows, curls and pulldowns continuously.',
    supersets: [
      {
        groupName: 'Pull-ups + Deadlift',
        rounds: 3,
        rest: 60,
        exercises: [
          ['Pull-up', { reps: 6 }],
          ['Deadlift (Trap Bar)', { reps: 8 }],
        ],
      },
      {
        groupName: 'Continuous block',
        rounds: 3,
        rest: 0,
        exercises: [
          ['Dumbbell Row', { reps: 10 }],
          ['Dumbbell Bicep Curl', { reps: 12 }],
          ['Lat Pulldown', { reps: 12 }],
        ],
      },
    ],
  },
  {
    name: 'Pull B',
    splitType: 'pull',
    minutes: 45,
    notes:
      'Pull-ups on their own to start, a minute between sets, then machine rows, shrugs and curls run continuously.',
    opener: { exercise: 'Pull-up', sets: 3, reps: 6, rest: 60 },
    supersets: [
      {
        groupName: 'Continuous block',
        rounds: 3,
        rest: 0,
        exercises: [
          ['Seated Row (Machine)', { reps: 12 }],
          ['Shrugs', { reps: 15 }],
          ['Barbell Curl', { reps: 12 }],
        ],
      },
    ],
  },
];

// —— Exercise library ——
const { data: existing } = await supabase
  .from('exercises')
  .select('id, name')
  .or(`user_id.is.null,user_id.eq.${U}`);

const byName = new Map<string, string>();
for (const e of existing ?? []) byName.set(e.name.toLowerCase(), e.id);

for (const ex of NEW_EXERCISES) {
  if (byName.has(ex.name.toLowerCase())) {
    console.log(`  exists: ${ex.name}`);
    continue;
  }
  const { data, error } = await supabase
    .from('exercises')
    .insert({ user_id: U, ...ex })
    .select('id')
    .single();
  if (error || !data) {
    console.error(`  FAILED to create ${ex.name}: ${error?.message}`);
    process.exit(1);
  }
  byName.set(ex.name.toLowerCase(), data.id);
  console.log(`  created: ${ex.name}`);
}

function idFor(name: string): string {
  const id = byName.get(name.toLowerCase());
  if (!id) {
    console.error(`\nNo exercise named "${name}". Aborting rather than writing a broken template.`);
    process.exit(1);
  }
  return id;
}

// —— Remove the superseded templates ——
const { data: removed } = await supabase
  .from('workout_templates')
  .delete()
  .eq('user_id', U)
  .in('name', REPLACE)
  .select('name');
console.log(`\nremoved: ${(removed ?? []).map((r) => r.name).join(', ') || 'none found'}`);

// —— Build and insert ——
for (const plan of PLANS) {
  const structure: unknown[] = [];

  if (plan.opener) {
    structure.push({
      type: 'standalone',
      exercise_id: idFor(plan.opener.exercise),
      sets: Array.from({ length: plan.opener.sets }, () => ({
        type: 'working',
        target_reps: plan.opener!.reps,
        rest_seconds: plan.opener!.rest,
      })),
    });
  }

  for (const ss of plan.supersets) {
    structure.push({
      type: 'superset',
      group_name: ss.groupName,
      rounds: ss.rounds,
      // rest_between_exercises is what the logger writes onto each set, so it
      // is the number that actually shows up on the rest timer between rounds.
      rest_between_exercises: ss.rest,
      rest_between_rounds: ss.rest,
      exercises: ss.exercises.map(([name, cfg]) => ({
        exercise_id: idFor(name),
        target_reps: cfg.reps,
        target_weight: cfg.weight ?? null,
      })),
    });
  }

  // Replace by name so re-running is idempotent.
  await supabase.from('workout_templates').delete().eq('user_id', U).eq('name', plan.name);

  const { error } = await supabase.from('workout_templates').insert({
    user_id: U,
    name: plan.name,
    type: 'strength',
    split_type: plan.splitType,
    structure,
    estimated_duration_min: plan.minutes,
    ai_generated: false,
    notes: plan.notes,
  });

  if (error) {
    console.error(`  FAILED ${plan.name}: ${error.message}`);
    process.exit(1);
  }
  const count =
    (plan.opener ? 1 : 0) + plan.supersets.reduce((n, ss) => n + ss.exercises.length, 0);
  console.log(`  ${plan.name}: ${count} exercises, ${structure.length} blocks`);
}

const { data: final } = await supabase
  .from('workout_templates')
  .select('name, type')
  .eq('user_id', U)
  .eq('type', 'strength')
  .order('name');
console.log(`\nstrength templates now: ${(final ?? []).map((t) => t.name).join(', ')}`);
