import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabase
    .from('health_source_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    preferences: data ?? {
      sleep_source: 'any',
      daily_summary_source: 'any',
      body_metrics_source: 'any',
      resting_hr_source: 'any',
      hrv_source: 'any',
    },
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const validSources = ['any', 'Garmin', 'Apple Health', 'Withings'];
  const validKeys = ['sleep_source', 'daily_summary_source', 'body_metrics_source', 'resting_hr_source', 'hrv_source'];

  const updates: Record<string, string> = {};
  for (const key of validKeys) {
    if (key in body && validSources.includes(body[key])) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid preferences provided' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('health_source_preferences')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('health_source_preferences')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('health_source_preferences')
      .insert({ user_id: user.id, ...updates });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return updated preferences
  const { data: updated } = await supabase
    .from('health_source_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ ok: true, preferences: updated });
}
