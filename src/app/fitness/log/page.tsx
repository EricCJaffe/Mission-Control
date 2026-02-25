import { supabaseServer } from '@/lib/supabase/server';
import WorkoutLoggerClient from '@/components/fitness/WorkoutLoggerClient';

export const dynamic = 'force-dynamic';

export default async function LogWorkoutPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: exercises },
    { data: templates },
    { data: todayPlan },
    { data: latestMetrics },
  ] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, category, equipment, muscle_groups, is_compound')
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order('name', { ascending: true }),
    supabase
      .from('workout_templates')
      .select('id, name, type, split_type, structure, estimated_duration_min')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
    supabase
      .from('planned_workouts')
      .select('*')
      .eq('user_id', user.id)
      .eq('scheduled_date', today)
      .maybeSingle(),
    supabase
      .from('body_metrics')
      .select('body_battery, hrv_ms, resting_hr, sleep_score')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <main className="pt-4 md:pt-8 pb-24">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Log Workout</h1>
        <p className="mt-1 text-sm text-slate-500">
          {today} — {latestMetrics?.body_battery != null ? `Body battery: ${latestMetrics.body_battery}` : 'No readiness data'}
        </p>
      </div>
      <WorkoutLoggerClient
        exercises={exercises ?? []}
        templates={templates ?? []}
        todayPlan={todayPlan}
        latestMetrics={latestMetrics}
      />
    </main>
  );
}
