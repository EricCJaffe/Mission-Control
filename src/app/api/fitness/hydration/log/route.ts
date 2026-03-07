import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculateHydrationTarget } from '@/lib/fitness/hydration';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [{ data: logs }, { data: target }] = await Promise.all([
    supabase
      .from('hydration_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('log_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('log_date', { ascending: false }),
    supabase
      .from('hydration_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({ ok: true, logs: logs || [], target: target || null });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const logDate = typeof body.log_date === 'string' ? body.log_date : new Date().toISOString().slice(0, 10);
    const intakeOz = Number(body.intake_oz) || 0;
    const outputOz = Number(body.output_oz) || 0;
    const workoutMinutes = Number(body.workout_minutes) || 0;
    const sweatLevel = ['low', 'moderate', 'high'].includes(body.sweat_level) ? body.sweat_level : 'moderate';
    const symptoms = Array.isArray(body.symptoms) ? body.symptoms.map(String) : [];
    const vitalsContext = body.vitals_context && typeof body.vitals_context === 'object' ? body.vitals_context : {};

    const { data: saved, error } = await supabase
      .from('hydration_logs')
      .upsert({
        user_id: user.id,
        log_date: logDate,
        intake_oz: intakeOz,
        output_oz: outputOz,
        workout_minutes: workoutMinutes,
        sweat_level: sweatLevel,
        sodium_mg: body.sodium_mg ? Number(body.sodium_mg) : null,
        potassium_mg: body.potassium_mg ? Number(body.potassium_mg) : null,
        symptoms,
        vitals_context: vitalsContext,
        notes: typeof body.notes === 'string' ? body.notes : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,log_date' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: target } = await supabase
      .from('hydration_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const recommendedTarget = target
      ? calculateHydrationTarget({
          defaults: {
            base_target_oz: target.base_target_oz,
            min_target_oz: target.min_target_oz,
            max_target_oz: target.max_target_oz,
            workout_adjustment_per_hour_oz: target.workout_adjustment_per_hour_oz,
            heat_adjustment_oz: target.heat_adjustment_oz,
            alert_weight_gain_lbs: Number(target.alert_weight_gain_lbs || 2),
          },
          workoutMinutes,
          sweatLevel,
        })
      : null;

    return NextResponse.json({ ok: true, log: saved, recommended_target_oz: recommendedTarget });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save hydration log' },
      { status: 500 }
    );
  }
}
