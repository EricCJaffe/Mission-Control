import { supabaseServer } from '@/lib/supabase/server';
import TrainingPlansClient from '@/components/fitness/TrainingPlansClient';

export const dynamic = 'force-dynamic';

export default async function TrainingPlansPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { data: plans } = await supabase
    .from('training_plans')
    .select('id, name, start_date, end_date, cycle_weeks, plan_type, status, config')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false });

  const activePlan = plans?.find((p) => p.status === 'active');

  const { data: upcomingWorkouts } = activePlan
    ? await supabase
        .from('planned_workouts')
        .select('id, scheduled_date, day_label, workout_type, prescribed')
        .eq('user_id', user.id)
        .eq('plan_id', activePlan.id)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(14)
    : { data: [] };

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Training Plans</h1>
        <p className="mt-1 text-sm text-slate-500">Periodized blocks with planned workouts and progression.</p>
      </div>
      <TrainingPlansClient
        plans={plans ?? []}
        upcomingWorkouts={upcomingWorkouts ?? []}
        activePlanId={activePlan?.id ?? null}
      />
    </main>
  );
}
