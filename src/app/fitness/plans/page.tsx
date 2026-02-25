import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';

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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Training Plans</h1>
          <p className="mt-1 text-sm text-slate-500">Periodized blocks with planned workouts and progression.</p>
        </div>
      </div>

      {plans?.length === 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-8 shadow-sm text-center text-slate-500">
          <p className="text-lg font-medium mb-2">No training plans yet.</p>
          <p className="text-sm">The March 5-week Cardiac Strength Protocol will be seeded when the database is ready.</p>
        </div>
      )}

      {activePlan && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Active Plan</h2>
          <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800">{activePlan.name}</h3>
              <span className="text-xs bg-green-100 text-green-800 rounded-full px-2.5 py-0.5 font-medium">Active</span>
            </div>
            <p className="text-sm text-slate-500">
              {activePlan.start_date} → {activePlan.end_date} · {activePlan.cycle_weeks} weeks
            </p>
          </div>

          {upcomingWorkouts && upcomingWorkouts.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-600 mb-2">Next 14 Days</h3>
              <div className="grid gap-2">
                {upcomingWorkouts.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 px-4 py-3 shadow-sm">
                    <span className="text-xs font-mono text-slate-400 w-24 shrink-0">{w.scheduled_date}</span>
                    <span className="text-sm font-medium text-slate-700">{w.day_label ?? w.workout_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {plans && plans.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">All Plans</h2>
          <div className="grid gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{plan.name}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    plan.status === 'active' ? 'bg-green-100 text-green-800' :
                    plan.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{plan.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{plan.start_date} → {plan.end_date}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        AI plan generation coming in Phase 5. The April 12-week plan will be generated from March data.
      </div>
    </main>
  );
}
