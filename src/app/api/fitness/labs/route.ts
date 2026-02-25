import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { analyzeLabResults } from '@/lib/fitness/ai';

/**
 * GET /api/fitness/labs — List lab results
 * POST /api/fitness/labs — Upload and analyze new lab results
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const labType = url.searchParams.get('type');

  let query = supabase
    .from('lab_results')
    .select('id, lab_date, lab_type, provider, file_name, ai_analysis, ai_flags, parsed_results, notes, created_at')
    .eq('user_id', user.id)
    .order('lab_date', { ascending: false })
    .limit(limit);

  if (labType) {
    query = query.eq('lab_type', labType);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { lab_date, lab_type, provider, raw_text, file_url, file_name, notes } = body;

  if (!lab_date || !lab_type || !raw_text) {
    return NextResponse.json(
      { error: 'lab_date, lab_type, and raw_text are required' },
      { status: 400 },
    );
  }

  // Get previous results of same type for trend analysis
  const { data: previousResults } = await supabase
    .from('lab_results')
    .select('lab_date, parsed_results')
    .eq('user_id', user.id)
    .eq('lab_type', lab_type)
    .order('lab_date', { ascending: false })
    .limit(3);

  // Get current health context
  const [bpRes, metricsRes] = await Promise.all([
    supabase.from('bp_readings')
      .select('systolic, diastolic')
      .eq('user_id', user.id)
      .order('reading_date', { ascending: false })
      .limit(7),
    supabase.from('body_metrics')
      .select('resting_hr, weight_lbs')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const bpReadings = bpRes.data ?? [];
  const latestMetrics = metricsRes.data;

  let bpAvg: { systolic: number; diastolic: number } | undefined;
  if (bpReadings.length > 0) {
    bpAvg = {
      systolic: Math.round(bpReadings.reduce((s, r) => s + r.systolic, 0) / bpReadings.length),
      diastolic: Math.round(bpReadings.reduce((s, r) => s + r.diastolic, 0) / bpReadings.length),
    };
  }

  // AI analysis
  const analysis = await analyzeLabResults({
    raw_text,
    lab_type,
    lab_date,
    previous_results: previousResults?.filter(r => r.parsed_results).map(r => ({
      lab_date: r.lab_date,
      parsed_results: r.parsed_results as Record<string, unknown>,
    })),
    current_medications: ['Carvedilol 12.5mg 2x daily', 'Losartan'],
    recent_bp_avg: bpAvg,
    current_weight: latestMetrics?.weight_lbs ? Number(latestMetrics.weight_lbs) : undefined,
    current_rhr: latestMetrics?.resting_hr ?? undefined,
  });

  // Save
  const { data: saved, error } = await supabase
    .from('lab_results')
    .insert({
      user_id: user.id,
      lab_date,
      lab_type,
      provider,
      raw_text,
      file_url,
      file_name,
      parsed_results: analysis.parsed_results,
      ai_analysis: analysis.ai_analysis,
      ai_flags: analysis.ai_flags,
      notes,
    })
    .select('id, lab_date, lab_type, ai_analysis, ai_flags, parsed_results')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(saved);
}
