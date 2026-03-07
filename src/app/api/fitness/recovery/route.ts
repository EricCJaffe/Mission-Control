import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_MODALITIES = ['sauna', 'cold_plunge', 'stretching', 'mobility'] as const;
const VALID_TIMING = ['pre_workout', 'post_workout', 'standalone', 'morning', 'afternoon', 'evening'] as const;

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const { data, error } = await supabase
    .from('recovery_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gte('session_date', fourteenDaysAgo.toISOString().slice(0, 10))
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const modality = VALID_MODALITIES.includes(body.modality) ? body.modality : null;
    if (!modality) return NextResponse.json({ error: 'Valid modality required' }, { status: 400 });

    const timingContext = VALID_TIMING.includes(body.timing_context) ? body.timing_context : 'standalone';
    const durationMin = clampInt(body.duration_min, 1, 240);
    if (!durationMin) return NextResponse.json({ error: 'Duration must be between 1 and 240 minutes' }, { status: 400 });

    const payload = {
      user_id: user.id,
      session_date: typeof body.session_date === 'string' ? body.session_date : new Date().toISOString().slice(0, 10),
      modality,
      duration_min: durationMin,
      temperature_f: numberOrNull(body.temperature_f),
      rounds: clampInt(body.rounds, 1, 20),
      timing_context: timingContext,
      linked_workout_id: typeof body.linked_workout_id === 'string' && body.linked_workout_id ? body.linked_workout_id : null,
      perceived_recovery: clampInt(body.perceived_recovery, 1, 10),
      energy_before: clampInt(body.energy_before, 1, 10),
      energy_after: clampInt(body.energy_after, 1, 10),
      soreness_before: clampInt(body.soreness_before, 1, 10),
      soreness_after: clampInt(body.soreness_after, 1, 10),
      notes: typeof body.notes === 'string' ? body.notes : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('recovery_sessions')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, session: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save recovery session' },
      { status: 500 }
    );
  }
}

function clampInt(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
