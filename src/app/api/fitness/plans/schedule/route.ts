import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan_id } = await req.json();
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
  if (framework.length === 0) {
    return NextResponse.json({ error: 'Plan has no weekly framework to schedule' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('planned_workouts')
    .select('scheduled_date, day_label')
    .eq('user_id', user.id)
    .eq('plan_id', plan.id);

  const existingKeys = new Set((existing || []).map((row) => `${row.scheduled_date}:${row.day_label || ''}`));

  const inserts: Array<Record<string, unknown>> = [];
  const start = new Date(`${plan.start_date}T12:00:00`);
  const end = new Date(`${plan.end_date}T12:00:00`);

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const isoDate = cursor.toISOString().slice(0, 10);
    const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayConfig = framework.find((item) => String(item.day_name || '').toLowerCase() === dayName);
    if (!dayConfig) continue;

    const label = String(dayConfig.session_type || 'Workout');
    const key = `${isoDate}:${label}`;
    if (existingKeys.has(key)) continue;

    const weekNumber = Math.floor((cursor.getTime() - start.getTime()) / (7 * 86400000)) + 1;

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

  if (inserts.length === 0) {
    return NextResponse.json({ ok: true, scheduled_count: 0, message: 'No new workouts needed scheduling' });
  }

  const { error: insertError } = await supabase.from('planned_workouts').insert(inserts);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, scheduled_count: inserts.length });
}

function mapWorkoutType(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('strength')) return 'strength';
  if (normalized.includes('vo2') || normalized.includes('interval') || normalized.includes('hiit') || normalized.includes('hard')) return 'hiit';
  if (normalized.includes('mobility') || normalized.includes('recovery')) return 'mobility';
  if (normalized.includes('cardio') || normalized.includes('zone 2') || normalized.includes('aerobic') || normalized.includes('long')) return 'cardio';
  return 'hybrid';
}
