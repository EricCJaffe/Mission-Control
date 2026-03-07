import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan_id, include_recovery_blocks } = await req.json();
  if (!plan_id) return NextResponse.json({ error: 'plan_id required' }, { status: 400 });

  const { data: plan, error } = await supabase
    .from('training_plans')
    .select('id, start_date, end_date, config')
    .eq('id', plan_id)
    .eq('user_id', user.id)
    .single();

  if (error || !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const config = (plan.config || {}) as Record<string, unknown>;
  const framework = Array.isArray(config.weekly_framework) ? config.weekly_framework as Array<Record<string, unknown>> : [];
  if (framework.length === 0 && !include_recovery_blocks) {
    return NextResponse.json({ error: 'Plan has no weekly framework to schedule' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('planned_workouts')
    .select('scheduled_date, day_label')
    .eq('user_id', user.id)
    .eq('plan_id', plan.id);

  const existingKeys = new Set((existing || []).map((row) => `${row.scheduled_date}:${row.day_label || ''}`));

  const inserts: Array<Record<string, unknown>> = [];
  const recoveryInserts: Array<Record<string, unknown>> = [];
  const start = new Date(`${plan.start_date}T12:00:00`);
  const end = new Date(`${plan.end_date}T12:00:00`);

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const isoDate = cursor.toISOString().slice(0, 10);
    const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const weekNumber = Math.floor((cursor.getTime() - start.getTime()) / (7 * 86400000)) + 1;
    const dayConfig = framework.find((item) => String(item.day_name || '').toLowerCase() === dayName);

    if (dayConfig) {
      const label = String(dayConfig.session_type || 'Workout');
      const key = `${isoDate}:${label}`;
      if (!existingKeys.has(key)) {
        inserts.push({
          user_id: user.id,
          plan_id: plan.id,
          scheduled_date: isoDate,
          week_number: weekNumber,
          day_label: label,
          workout_type: mapWorkoutType(label),
          prescribed: {
            estimated_duration_min: Number(dayConfig.duration_min) || null,
            purpose: dayConfig.purpose || null,
            notes: dayConfig.notes || null,
            source: 'plan_framework',
          },
          notes: typeof dayConfig.notes === 'string' ? dayConfig.notes : null,
          scheduled_time: '07:00',
          status: 'pending',
        });
      }
    }

    if (include_recovery_blocks) {
      const recoveryBlock = buildRecoveryBlock({
        isoDate,
        weekNumber,
        dayName,
        planId: plan.id,
        userId: user.id,
        existingKeys,
      });
      if (recoveryBlock) recoveryInserts.push(recoveryBlock);
    }
  }

  if (inserts.length === 0 && recoveryInserts.length === 0) {
    return NextResponse.json({ ok: true, scheduled_count: 0, recovery_count: 0, message: 'No new workouts needed scheduling' });
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('planned_workouts').insert(inserts);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (recoveryInserts.length > 0) {
    const { error: recoveryError } = await supabase.from('planned_workouts').insert(recoveryInserts);
    if (recoveryError) return NextResponse.json({ error: recoveryError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scheduled_count: inserts.length, recovery_count: recoveryInserts.length });
}

function mapWorkoutType(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('strength')) return 'strength';
  if (normalized.includes('vo2') || normalized.includes('interval') || normalized.includes('hiit') || normalized.includes('hard')) return 'hiit';
  if (normalized.includes('mobility') || normalized.includes('recovery')) return 'mobility';
  if (normalized.includes('cardio') || normalized.includes('zone 2') || normalized.includes('aerobic') || normalized.includes('long')) return 'cardio';
  return 'hybrid';
}

function buildRecoveryBlock({
  isoDate,
  weekNumber,
  dayName,
  planId,
  userId,
  existingKeys,
}: {
  isoDate: string;
  weekNumber: number;
  dayName: string;
  planId: string;
  userId: string;
  existingKeys: Set<string>;
}) {
  let notes: string | null = null;
  let estimated_duration_min = 20;

  if (dayName === 'wednesday') {
    notes = 'Optional recovery block: mobility or stretching after the midweek load.';
  } else if (dayName === 'friday') {
    notes = 'Optional recovery block: mobility, stretching, or light sauna before the weekend build.';
  } else if (dayName === 'sunday') {
    estimated_duration_min = 25;
    notes = 'Optional off-day recovery block: mobility, stretching, breathing, or easy recovery work.';
  }

  if (!notes) return null;

  const day_label = 'Recovery Block';
  const key = `${isoDate}:${day_label}`;
  if (existingKeys.has(key)) return null;

  return {
    user_id: userId,
    plan_id: planId,
    scheduled_date: isoDate,
    week_number: weekNumber,
    day_label,
    workout_type: 'mobility',
    prescribed: {
      estimated_duration_min,
      purpose: 'Support readiness, reduce stiffness, and improve adherence to the main plan.',
      notes,
      source: 'plan_recovery_block',
      optional: true,
    },
    notes,
    scheduled_time: '18:00',
    status: 'pending',
  };
}
