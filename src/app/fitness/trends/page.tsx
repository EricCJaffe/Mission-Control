import { supabaseServer } from '@/lib/supabase/server';
import FitnessTrendsClient from '@/components/fitness/FitnessTrendsClient';

export const dynamic = 'force-dynamic';

export default async function FitnessTrendsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Default to 30 days, matching DateRangeFilter default
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString().slice(0, 10);

  const [
    { data: bodyMetrics },
    { data: bpReadings },
    { data: workoutLogs },
    { data: formHistory },
  ] = await Promise.all([
    supabase
      .from('body_metrics')
      .select('metric_date, resting_hr, hrv_ms, body_battery, weight_lbs, body_fat_pct, muscle_mass_lbs, bone_mass_lbs, hydration_lbs, sleep_score, vo2_max')
      .eq('user_id', user.id)
      .gte('metric_date', since)
      .order('metric_date', { ascending: true }),
    supabase
      .from('bp_readings')
      .select('reading_date, systolic, diastolic, pulse, flag_level')
      .eq('user_id', user.id)
      .gte('reading_date', `${since}T00:00:00`)
      .order('reading_date', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('workout_date, workout_type, duration_minutes, tss, compliance_color, rpe_session')
      .eq('user_id', user.id)
      .gte('workout_date', `${since}T00:00:00`)
      .order('workout_date', { ascending: true }),
    supabase
      .from('fitness_form')
      .select('calc_date, fitness_ctl, fatigue_atl, form_tsb, form_status, daily_tss')
      .eq('user_id', user.id)
      .gte('calc_date', since)
      .order('calc_date', { ascending: true }),
  ]);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Trends</h1>
        <p className="mt-1 text-sm text-slate-500">Cardiac metrics, training load, and body composition trends.</p>
      </div>
      <FitnessTrendsClient
        bodyMetrics={bodyMetrics ?? []}
        bpReadings={bpReadings ?? []}
        workoutLogs={workoutLogs ?? []}
        formHistory={formHistory ?? []}
      />
    </main>
  );
}
