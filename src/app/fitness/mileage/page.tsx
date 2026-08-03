import { supabaseServer } from '@/lib/supabase/server';
import MileageClient from '@/components/fitness/MileageClient';
import {
  monthlyBuckets,
  periodStart,
  periodTotal,
  projectPeriod,
  toIso,
  weeklyBuckets,
  workoutTotals,
  type DayDistance,
  type PeriodKey,
  type WorkoutDistance,
} from '@/lib/fitness/mileage';
import { analyseRun } from '@/lib/fitness/run-analysis';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mileage | Fitness' };

const PERIODS: PeriodKey[] = ['week', 'month', 'year', 'all'];

export default async function MileagePage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = toIso(new Date());

  const [daysRes, routesRes] = await Promise.all([
    supabase
      .from('daily_summaries')
      .select('summary_date, distance_miles, total_steps')
      .eq('user_id', user.id)
      .order('summary_date', { ascending: false }),
    // Route geometry is the only reliable per-workout distance — workout_logs
    // has no distance column, so session mileage is measured rather than read.
    supabase
      .from('workout_routes')
      .select('workout_log_id, points, workout_logs!inner(workout_date, workout_type, duration_minutes)')
      .eq('user_id', user.id),
  ]);

  if (daysRes.error) console.error('[mileage] daily_summaries:', daysRes.error.message);
  if (routesRes.error) console.error('[mileage] workout_routes:', routesRes.error.message);

  const days = (daysRes.data ?? []) as DayDistance[];

  const workouts: WorkoutDistance[] = [];
  for (const row of routesRes.data ?? []) {
    const log = (row as unknown as {
      workout_logs: { workout_date: string; workout_type: string | null; duration_minutes: number | null };
    }).workout_logs;
    if (!log) continue;
    const analysis = analyseRun((row as unknown as { points: [] }).points ?? []);
    if (!analysis) continue;
    workouts.push({
      workout_date: log.workout_date,
      workout_type: log.workout_type,
      miles: analysis.totalMiles,
      minutes: log.duration_minutes,
    });
  }

  const totals = PERIODS.map((p) => periodTotal(days, p, today));
  const workoutsByPeriod = Object.fromEntries(
    PERIODS.map((p) => [p, workoutTotals(workouts, periodStart(p, today), today)]),
  );
  const projections = Object.fromEntries(
    totals.map((t) => [t.period, projectPeriod(t, today)]),
  );

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Mileage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Distance on foot by week, month and year — everyday walking and logged sessions
          counted separately.
        </p>
      </div>
      <MileageClient
        totals={totals}
        monthly={monthlyBuckets(days, today.slice(0, 4))}
        weekly={weeklyBuckets(days, today, 12)}
        workoutsByPeriod={workoutsByPeriod}
        projections={projections}
        year={today.slice(0, 4)}
      />
    </main>
  );
}
