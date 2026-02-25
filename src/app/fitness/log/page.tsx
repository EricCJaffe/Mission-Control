import { supabaseServer } from '@/lib/supabase/server';
import WorkoutLoggerClient from '@/components/fitness/WorkoutLoggerClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ repeat?: string }>;
};

export default async function LogWorkoutPage({ searchParams }: PageProps) {
  const params = await searchParams;
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

  // Fetch repeat workout data if ?repeat=<id> is present
  let repeatData: {
    workout_type: string;
    template_id: string | null;
    sets: Array<{
      exercise_id: string | null;
      set_number: number;
      set_type: string;
      reps: number | null;
      weight_lbs: number | null;
      rpe: number | null;
      superset_group: string | null;
      notes: string | null;
      exercises: { name: string; category: string } | null;
    }>;
  } | null = null;

  if (params.repeat) {
    const { data: workout } = await supabase
      .from('workout_logs')
      .select('workout_type, template_id')
      .eq('id', params.repeat)
      .eq('user_id', user.id)
      .single();

    if (workout) {
      const { data: sets } = await supabase
        .from('set_logs')
        .select('exercise_id, set_number, set_type, reps, weight_lbs, rpe, superset_group, notes, exercises:exercise_id(name, category)')
        .eq('workout_log_id', params.repeat)
        .order('set_number', { ascending: true });

      repeatData = {
        workout_type: workout.workout_type,
        template_id: workout.template_id,
        sets: (sets ?? []).map(s => ({
          ...s,
          // Supabase join may return object or array — normalize to object | null
          exercises: Array.isArray(s.exercises) ? s.exercises[0] ?? null : s.exercises ?? null,
        })),
      };
    }
  }

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
        repeatData={repeatData}
      />
    </main>
  );
}
