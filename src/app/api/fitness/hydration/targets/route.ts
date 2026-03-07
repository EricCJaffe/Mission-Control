import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('hydration_targets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, target: data || null });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const payload = {
      user_id: user.id,
      base_target_oz: clamp(Number(body.base_target_oz) || 96, 85, 128),
      min_target_oz: clamp(Number(body.min_target_oz) || 85, 64, 128),
      max_target_oz: clamp(Number(body.max_target_oz) || 128, 85, 160),
      workout_adjustment_per_hour_oz: clamp(Number(body.workout_adjustment_per_hour_oz) || 24, 8, 40),
      heat_adjustment_oz: clamp(Number(body.heat_adjustment_oz) || 12, 0, 32),
      reminder_enabled: body.reminder_enabled !== false,
      reminder_time: typeof body.reminder_time === 'string' && body.reminder_time ? body.reminder_time : null,
      reminder_message: typeof body.reminder_message === 'string' ? body.reminder_message : null,
      alert_weight_gain_lbs: Number(body.alert_weight_gain_lbs) || 2,
      notes: typeof body.notes === 'string' ? body.notes : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hydration_targets')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, target: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save hydration targets' },
      { status: 500 }
    );
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
