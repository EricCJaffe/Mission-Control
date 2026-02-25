import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { classifyBP } from '@/lib/fitness/alerts';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  let query = supabase
    .from('bp_readings')
    .select('id, reading_date, systolic, diastolic, pulse, flag_level, position, arm, time_of_day, pre_or_post_meds, pre_or_post_workout, notes')
    .eq('user_id', user.id)
    .order('reading_date', { ascending: false });

  if (start) query = query.gte('reading_date', start);
  if (end) query = query.lte('reading_date', end);
  if (!start && !end) query = query.limit(200);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, readings: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { systolic, diastolic, pulse, position, arm, time_of_day, pre_or_post_meds, pre_or_post_workout, notes } = body;

  if (!systolic || !diastolic) {
    return NextResponse.json({ error: 'systolic and diastolic required' }, { status: 400 });
  }

  const flag_level = classifyBP(systolic, diastolic);

  const { data, error } = await supabase.from('bp_readings').insert({
    user_id: user.id,
    systolic,
    diastolic,
    pulse: pulse || null,
    position: position || 'seated',
    arm: arm || 'left',
    time_of_day: time_of_day || null,
    pre_or_post_meds: pre_or_post_meds || null,
    pre_or_post_workout: pre_or_post_workout || null,
    notes: notes || null,
    flag_level,
    source: 'manual',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reading: data });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('bp_readings')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
