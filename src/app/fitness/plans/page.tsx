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

  // Upcoming work comes from EVERY active plan, not just the first one found.
  // Running a 5K block alongside a strength block is normal, and showing only
  // one made the other look as though it had stopped — the same single-active
  // assumption that hid a second reading plan.
  const activePlans = (plans ?? []).filter((p) => p.status === 'active');
  const activePlanIds = activePlans.map((p) => p.id);

  const { data: upcomingWorkouts } = activePlanIds.length
    ? await supabase
        .from('planned_workouts')
        .select('id, scheduled_date, day_label, workout_type, prescribed, plan_id')
        .eq('user_id', user.id)
        .in('plan_id', activePlanIds)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(28)
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
        activePlanId={activePlans[0]?.id ?? null}
        activePlanIds={activePlanIds}
        planNames={Object.fromEntries((plans ?? []).map((p) => [p.id, p.name]))}
      />
    </main>
  );
}
