import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { calculatePowerZones, estimateFTPFrom20Min } from '@/lib/fitness/power-zones';

function getSeason(date: Date): 'winter' | 'spring' | 'summer' | 'fall' {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

function seasonalMultiplier(season: 'winter' | 'spring' | 'summer' | 'fall'): number {
  if (season === 'winter') return 1.02;
  if (season === 'summer') return 0.97;
  return 1.0;
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const season = getSeason(now);
  const since = new Date(now);
  since.setDate(since.getDate() - 90);

  const [{ data: profile }, { data: cardioRows }] = await Promise.all([
    supabase
      .from('athlete_profile')
      .select('ftp_watts, power_zones')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('cardio_logs')
      .select('avg_power_watts, normalized_power, workout_logs!inner(user_id, workout_date, duration_minutes)')
      .eq('workout_logs.user_id', user.id)
      .gte('workout_logs.workout_date', since.toISOString().slice(0, 10))
      .not('avg_power_watts', 'is', null),
  ]);

  const powerCandidates = (cardioRows || [])
    .map((r) => {
      const row = r as unknown as {
        avg_power_watts: number | null;
        normalized_power: number | null;
        workout_logs: { duration_minutes: number | null };
      };
      const duration = row.workout_logs?.duration_minutes || 0;
      if (duration < 20) return null;
      return row.normalized_power || row.avg_power_watts;
    })
    .filter((p): p is number => typeof p === 'number' && p > 0);

  if (powerCandidates.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'insufficient_data',
      message: 'Need at least one 20+ minute cycling session with power data in the last 90 days.',
      season,
    });
  }

  const best20MinEquivalent = Math.max(...powerCandidates);
  const baselineFtp = estimateFTPFrom20Min(best20MinEquivalent);
  const adjustedFtp = Math.max(80, Math.round(baselineFtp * seasonalMultiplier(season)));

  return NextResponse.json({
    ok: true,
    season,
    sample_count: powerCandidates.length,
    current_ftp: profile?.ftp_watts || null,
    baseline_ftp_estimate: baselineFtp,
    seasonal_adjusted_ftp: adjustedFtp,
    suggested_power_zones: calculatePowerZones(adjustedFtp),
  });
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const ftp = Number(body.ftp_watts);
  if (!Number.isFinite(ftp) || ftp <= 0) {
    return NextResponse.json({ error: 'Valid ftp_watts is required' }, { status: 400 });
  }

  const powerZones = calculatePowerZones(Math.round(ftp));
  const { data: profile, error } = await supabase
    .from('athlete_profile')
    .upsert(
      {
        user_id: user.id,
        ftp_watts: Math.round(ftp),
        power_zones: powerZones,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('ftp_watts, power_zones')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile });
}
