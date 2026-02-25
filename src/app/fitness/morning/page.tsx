import { supabaseServer } from '@/lib/supabase/server';
import MorningBriefingClient from '@/components/fitness/MorningBriefingClient';

export const dynamic = 'force-dynamic';

export default async function MorningBriefingPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Parallel data fetch
  const [metricsRes, formRes, bpRes, profileRes, todayPlanRes, readinessRes, strainRes] = await Promise.all([
    supabase.from('body_metrics')
      .select('resting_hr, hrv_ms, body_battery, sleep_score, sleep_duration_min, stress_avg, training_readiness, meds_taken_at')
      .eq('user_id', user.id).order('metric_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('fitness_form')
      .select('form_tsb, form_status, fitness_ctl, fatigue_atl')
      .eq('user_id', user.id).order('calc_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bp_readings')
      .select('systolic, diastolic, pulse, reading_date, flag_level')
      .eq('user_id', user.id).order('reading_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('athlete_profile')
      .select('rhr_baseline, hrv_baseline, sleep_target_min, max_hr_ceiling')
      .eq('user_id', user.id).maybeSingle(),
    supabase.from('planned_workouts')
      .select('id, day_label, workout_type, prescribed')
      .eq('user_id', user.id).eq('scheduled_date', today).maybeSingle(),
    supabase.from('daily_readiness')
      .select('readiness_score, readiness_color, readiness_label, hrv_score, rhr_score, sleep_score, body_battery_score, form_score, bp_score, weather_score, recommendation')
      .eq('user_id', user.id).eq('calc_date', today).maybeSingle(),
    supabase.from('daily_strain')
      .select('strain_score, strain_level')
      .eq('user_id', user.id).eq('calc_date', today).maybeSingle(),
  ]);

  // Calculate days since BP
  let daysSinceBP: number | null = null;
  if (bpRes.data?.reading_date) {
    daysSinceBP = Math.floor((Date.now() - new Date(bpRes.data.reading_date).getTime()) / 86400000);
  }

  return (
    <main className="pt-4 md:pt-8">
      <MorningBriefingClient
        date={today}
        metrics={metricsRes.data}
        form={formRes.data}
        latestBP={bpRes.data}
        profile={profileRes.data}
        todayPlan={todayPlanRes.data}
        readiness={readinessRes.data}
        strain={strainRes.data}
        daysSinceBP={daysSinceBP}
      />
    </main>
  );
}
