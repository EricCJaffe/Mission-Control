import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { generateNaturalLanguageWorkout } from '@/lib/fitness/ai';

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { prompt } = body;

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 });
  }

  // Fetch exercise library for the AI to reference
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, category, muscle_groups')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('name', { ascending: true });

  // Get latest readiness metrics
  const { data: latestMetrics } = await supabase
    .from('body_metrics')
    .select('body_battery, hrv_ms, resting_hr, sleep_score')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestForm } = await supabase
    .from('fitness_form')
    .select('form_tsb, form_status')
    .eq('user_id', user.id)
    .order('calc_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const workout = await generateNaturalLanguageWorkout({
    prompt,
    exerciseLibrary: exercises ?? [],
    metrics: { ...latestMetrics, ...latestForm },
  });

  return NextResponse.json({ workout });
}
