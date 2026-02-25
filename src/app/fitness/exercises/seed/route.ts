import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const SEED_EXERCISES = [
  // PUSH
  { name: 'Flat Barbell Bench Press', category: 'push', equipment: 'barbell', muscle_groups: ['chest','triceps','shoulders'], is_compound: true },
  { name: 'Incline Barbell Bench Press', category: 'push', equipment: 'barbell', muscle_groups: ['chest','triceps','shoulders'], is_compound: true },
  { name: 'Decline Barbell Bench Press', category: 'push', equipment: 'barbell', muscle_groups: ['chest','triceps'], is_compound: true },
  { name: 'Flat Dumbbell Press', category: 'push', equipment: 'dumbbell', muscle_groups: ['chest','triceps','shoulders'], is_compound: true },
  { name: 'Incline Dumbbell Press', category: 'push', equipment: 'dumbbell', muscle_groups: ['chest','triceps','shoulders'], is_compound: true },
  { name: 'Overhead Press (Barbell)', category: 'push', equipment: 'barbell', muscle_groups: ['shoulders','triceps'], is_compound: true },
  { name: 'Dumbbell Shoulder Press', category: 'push', equipment: 'dumbbell', muscle_groups: ['shoulders','triceps'], is_compound: true },
  { name: 'Cable Chest Fly', category: 'push', equipment: 'cable', muscle_groups: ['chest'], is_compound: false },
  { name: 'Dumbbell Lateral Raise', category: 'push', equipment: 'dumbbell', muscle_groups: ['shoulders'], is_compound: false },
  { name: 'Tricep Pushdown (Cable)', category: 'push', equipment: 'cable', muscle_groups: ['triceps'], is_compound: false },
  { name: 'Overhead Tricep Extension', category: 'push', equipment: 'cable', muscle_groups: ['triceps'], is_compound: false },
  { name: 'Skull Crushers', category: 'push', equipment: 'barbell', muscle_groups: ['triceps'], is_compound: false },
  { name: 'Dips (Chest)', category: 'push', equipment: 'bodyweight', muscle_groups: ['chest','triceps'], is_compound: true },
  { name: 'Push-up', category: 'push', equipment: 'bodyweight', muscle_groups: ['chest','triceps','shoulders'], is_compound: true },
  // PULL
  { name: 'Deadlift', category: 'pull', equipment: 'barbell', muscle_groups: ['back','hamstrings','glutes'], is_compound: true },
  { name: 'Barbell Row', category: 'pull', equipment: 'barbell', muscle_groups: ['back','biceps'], is_compound: true },
  { name: 'Lat Pulldown', category: 'pull', equipment: 'cable', muscle_groups: ['back','biceps'], is_compound: true },
  { name: 'Seated Cable Row', category: 'pull', equipment: 'cable', muscle_groups: ['back','biceps'], is_compound: true },
  { name: 'Pull-up', category: 'pull', equipment: 'bodyweight', muscle_groups: ['back','biceps'], is_compound: true },
  { name: 'Chin-up', category: 'pull', equipment: 'bodyweight', muscle_groups: ['back','biceps'], is_compound: true },
  { name: 'Face Pull', category: 'pull', equipment: 'cable', muscle_groups: ['rear_delts','rotator_cuff'], is_compound: false },
  { name: 'Dumbbell Row', category: 'pull', equipment: 'dumbbell', muscle_groups: ['back','biceps'], is_compound: false },
  { name: 'Barbell Curl', category: 'pull', equipment: 'barbell', muscle_groups: ['biceps'], is_compound: false },
  { name: 'Dumbbell Bicep Curl', category: 'pull', equipment: 'dumbbell', muscle_groups: ['biceps'], is_compound: false },
  { name: 'Hammer Curl', category: 'pull', equipment: 'dumbbell', muscle_groups: ['biceps','brachialis'], is_compound: false },
  { name: 'Shrugs', category: 'pull', equipment: 'barbell', muscle_groups: ['traps'], is_compound: false },
  // LEGS
  { name: 'Back Squat', category: 'legs', equipment: 'barbell', muscle_groups: ['quads','glutes','hamstrings'], is_compound: true },
  { name: 'Front Squat', category: 'legs', equipment: 'barbell', muscle_groups: ['quads','glutes'], is_compound: true },
  { name: 'Leg Press', category: 'legs', equipment: 'machine', muscle_groups: ['quads','glutes','hamstrings'], is_compound: true },
  { name: 'Romanian Deadlift (RDL)', category: 'legs', equipment: 'barbell', muscle_groups: ['hamstrings','glutes'], is_compound: true },
  { name: 'Leg Curl (Machine)', category: 'legs', equipment: 'machine', muscle_groups: ['hamstrings'], is_compound: false },
  { name: 'Leg Extension (Machine)', category: 'legs', equipment: 'machine', muscle_groups: ['quads'], is_compound: false },
  { name: 'Calf Raise (Standing)', category: 'legs', equipment: 'machine', muscle_groups: ['calves'], is_compound: false },
  { name: 'Walking Lunge', category: 'legs', equipment: 'dumbbell', muscle_groups: ['quads','glutes','hamstrings'], is_compound: true },
  { name: 'Bulgarian Split Squat', category: 'legs', equipment: 'dumbbell', muscle_groups: ['quads','glutes'], is_compound: true },
  // CORE
  { name: 'Plank', category: 'core', equipment: 'bodyweight', muscle_groups: ['core','abs'], is_compound: false },
  { name: 'Hanging Knee Raise', category: 'core', equipment: 'bodyweight', muscle_groups: ['abs','hip_flexors'], is_compound: false },
  { name: 'Cable Crunch', category: 'core', equipment: 'cable', muscle_groups: ['abs'], is_compound: false },
  { name: 'Russian Twist', category: 'core', equipment: 'bodyweight', muscle_groups: ['obliques','abs'], is_compound: false },
  { name: 'Ab Wheel Rollout', category: 'core', equipment: 'other', muscle_groups: ['abs','core'], is_compound: false },
  { name: 'Dead Bug', category: 'core', equipment: 'bodyweight', muscle_groups: ['core','abs'], is_compound: false },
  { name: 'Bird Dog', category: 'core', equipment: 'bodyweight', muscle_groups: ['core','back'], is_compound: false },
  // CARDIO
  { name: 'Treadmill Run', category: 'cardio', equipment: 'treadmill', muscle_groups: ['cardio'], is_compound: false },
  { name: 'Outdoor Run', category: 'cardio', equipment: null, muscle_groups: ['cardio'], is_compound: false },
  { name: 'Walk', category: 'cardio', equipment: null, muscle_groups: ['cardio'], is_compound: false },
  { name: 'Treadmill Walk', category: 'cardio', equipment: 'treadmill', muscle_groups: ['cardio'], is_compound: false },
  { name: 'Indoor Cycling (Trainer)', category: 'cardio', equipment: 'trainer', muscle_groups: ['cardio','quads','glutes'], is_compound: false },
  { name: 'Outdoor Cycling', category: 'cardio', equipment: 'bike', muscle_groups: ['cardio','quads','glutes'], is_compound: false },
  { name: 'Elliptical', category: 'cardio', equipment: 'machine', muscle_groups: ['cardio'], is_compound: false },
  // MOBILITY
  { name: 'Foam Rolling', category: 'mobility', equipment: 'other', muscle_groups: ['full_body'], is_compound: false },
  { name: 'Dynamic Warm-up', category: 'mobility', equipment: 'bodyweight', muscle_groups: ['full_body'], is_compound: false },
  { name: 'Hip Flexor Stretch', category: 'mobility', equipment: 'bodyweight', muscle_groups: ['hip_flexors'], is_compound: false },
  { name: 'Thoracic Rotation', category: 'mobility', equipment: 'bodyweight', muscle_groups: ['back','thoracic_spine'], is_compound: false },
];

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .is('user_id', null);

  return NextResponse.json({ global_exercises: count ?? 0 });
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if already seeded
  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .is('user_id', null);

  if ((count ?? 0) >= 40) {
    return NextResponse.json({ ok: true, message: 'Already seeded', count });
  }

  const rows = SEED_EXERCISES.map(e => ({
    ...e,
    is_template: true,
    user_id: null,
  }));

  const { error } = await supabase.from('exercises').insert(rows);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: SEED_EXERCISES.length });
}
