import { supabaseServer } from '@/lib/supabase/server';
import FitnessDashboardClient from '@/components/fitness/FitnessDashboardClient';
import HealthDocPendingUpdates from '@/components/fitness/HealthDocPendingUpdates';

export const dynamic = 'force-dynamic';

export default async function FitnessPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(today);

  const [
    { data: todayPlan },
    { data: recentLogs },
    { data: latestMetrics },
    { data: latestBP },
    { data: latestForm },
    { data: unacknowledgedInsights },
    { data: weekPlanned },
    { data: readiness },
    { data: strain },
  ] = await Promise.all([
    supabase
      .from('planned_workouts')
      .select('*')
      .eq('user_id', user.id)
      .eq('scheduled_date', today)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('id, workout_date, workout_type, duration_minutes, tss, compliance_color, rpe_session')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
      .limit(5),
    supabase
      .from('body_metrics')
      .select('resting_hr, hrv_ms, body_battery, sleep_score, training_readiness, weight_lbs, metric_date')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('bp_readings')
      .select('systolic, diastolic, pulse, flag_level, reading_date')
      .eq('user_id', user.id)
      .order('reading_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('fitness_form')
      .select('form_tsb, form_status, fitness_ctl, fatigue_atl, calc_date')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ai_insights')
      .select('id, title, content, priority, insight_type, insight_date')
      .eq('user_id', user.id)
      .eq('acknowledged', false)
      .in('priority', ['warning', 'critical'])
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('planned_workouts')
      .select('id, scheduled_date, day_label, workout_type, prescribed')
      .eq('user_id', user.id)
      .gte('scheduled_date', weekStart)
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('daily_readiness')
      .select('readiness_score, readiness_color, readiness_label, recommendation')
      .eq('user_id', user.id)
      .eq('calc_date', today)
      .maybeSingle(),
    supabase
      .from('daily_strain')
      .select('strain_score, strain_level')
      .eq('user_id', user.id)
      .eq('calc_date', today)
      .maybeSingle(),
  ]);

  // Get workout logs for this week to cross-reference with planned
  const { data: weekLogs } = await supabase
    .from('workout_logs')
    .select('id, workout_date, workout_type, duration_minutes, compliance_color')
    .eq('user_id', user.id)
    .gte('workout_date', `${weekStart}T00:00:00`)
    .order('workout_date', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Fitness</h1>
        <p className="mt-1 text-sm text-slate-500">Training dashboard — cardiac-aware tracking.</p>
      </div>

      {/* Health.md Pending Updates Notification */}
      <div className="mb-6">
        <HealthDocPendingUpdates showFullList={false} />
      </div>

      <FitnessDashboardClient
        today={today}
        todayPlan={todayPlan}
        recentLogs={recentLogs ?? []}
        latestMetrics={latestMetrics}
        latestBP={latestBP}
        latestForm={latestForm}
        alerts={unacknowledgedInsights ?? []}
        weekPlanned={weekPlanned ?? []}
        weekLogs={weekLogs ?? []}
        readiness={readiness}
        strain={strain}
      />
    </main>
  );
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 0 : day; // treat Sunday as start
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}
