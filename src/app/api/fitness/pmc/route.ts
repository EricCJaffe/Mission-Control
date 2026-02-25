import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calcPmc } from '@/lib/fitness/pmc';

// POST /api/fitness/pmc — recalculate and upsert PMC for the authenticated user
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch all workout TSS, grouped by date
  const { data: logs, error } = await supabase
    .from('workout_logs')
    .select('workout_date, tss')
    .eq('user_id', user.id)
    .not('tss', 'is', null)
    .order('workout_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sum TSS per day
  const tssMap = new Map<string, number>();
  for (const log of logs ?? []) {
    const date = log.workout_date.slice(0, 10);
    tssMap.set(date, (tssMap.get(date) ?? 0) + (log.tss ?? 0));
  }

  const tssHistory = Array.from(tssMap.entries()).map(([date, daily_tss]) => ({ date, daily_tss }));
  if (tssHistory.length === 0) {
    return NextResponse.json({ ok: true, days_calculated: 0 });
  }

  // Get seed CTL/ATL from previous record before our range
  const oldestDate = tssHistory[0].date;
  const { data: seedRow } = await supabase
    .from('fitness_form')
    .select('fitness_ctl, fatigue_atl')
    .eq('user_id', user.id)
    .lt('calc_date', oldestDate)
    .order('calc_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const pmcDays = calcPmc(tssHistory, seedRow?.fitness_ctl ?? 0, seedRow?.fatigue_atl ?? 0);

  // Upsert all days
  const upserts = pmcDays.map((d) => ({
    user_id: user.id,
    calc_date: d.date,
    daily_tss: d.daily_tss,
    fitness_ctl: d.ctl,
    fatigue_atl: d.atl,
    form_tsb: d.tsb,
    form_status: d.form_status,
    ramp_rate_7d: d.ramp_rate_7d,
    ramp_rate_28d: d.ramp_rate_28d,
  }));

  const { error: upsertError } = await supabase
    .from('fitness_form')
    .upsert(upserts, { onConflict: 'user_id,calc_date' });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ ok: true, days_calculated: pmcDays.length });
}
