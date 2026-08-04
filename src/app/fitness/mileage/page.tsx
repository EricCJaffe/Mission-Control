import { supabaseServer } from '@/lib/supabase/server';
import MileageClient from '@/components/fitness/MileageClient';
import {
  monthlyBuckets,
  periodTotal,
  projectPeriod,
  toIso,
  workoutPeriodTotal,
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

  const [daysRes, cardioRes, routesRes] = await Promise.all([
    supabase
      .from('daily_summaries')
      .select('summary_date, distance_miles, total_steps')
      .eq('user_id', user.id)
      .order('summary_date', { ascending: false }),
    // cardio_logs is the real source for session distance: 121 sessions carry
    // it against 6 with GPS, and it covers treadmill and indoor work, which
    // have no route at all. The training block alternates onto the treadmill,
    // so measuring only outdoor runs would report half the mileage as zero.
    supabase
      .from('cardio_logs')
      .select('workout_log_id, distance_miles, workout_logs!inner(user_id, workout_date, workout_type, duration_minutes)')
      .eq('workout_logs.user_id', user.id)
      .not('distance_miles', 'is', null),
    // GPS is still consulted for anything cardio_logs missed — a route with no
    // reported distance can still be measured from its own geometry.
    supabase
      .from('workout_routes')
      .select('workout_log_id, points, workout_logs!inner(workout_date, workout_type, duration_minutes)')
      .eq('user_id', user.id),
  ]);

  if (daysRes.error) console.error('[mileage] daily_summaries:', daysRes.error.message);
  if (cardioRes.error) console.error('[mileage] cardio_logs:', cardioRes.error.message);
  if (routesRes.error) console.error('[mileage] workout_routes:', routesRes.error.message);

  const days = (daysRes.data ?? []) as DayDistance[];

  const workouts: WorkoutDistance[] = [];
  const seen = new Set<string>();

  for (const row of cardioRes.data ?? []) {
    const r = row as unknown as {
      workout_log_id: string;
      distance_miles: number | null;
      workout_logs: { workout_date: string; workout_type: string | null; duration_minutes: number | null };
    };
    if (!r.workout_logs || !r.distance_miles) continue;
    seen.add(r.workout_log_id);
    workouts.push({
      workout_date: r.workout_logs.workout_date,
      workout_type: r.workout_logs.workout_type,
      miles: r.distance_miles,
      minutes: r.workout_logs.duration_minutes,
    });
  }

  for (const row of routesRes.data ?? []) {
    const r = row as unknown as {
      workout_log_id: string;
      points: [];
      workout_logs: { workout_date: string; workout_type: string | null; duration_minutes: number | null };
    };
    if (!r.workout_logs || seen.has(r.workout_log_id)) continue;
    const analysis = analyseRun(r.points ?? []);
    if (!analysis) continue;
    workouts.push({
      workout_date: r.workout_logs.workout_date,
      workout_type: r.workout_logs.workout_type,
      miles: analysis.totalMiles,
      minutes: r.workout_logs.duration_minutes,
    });
  }

  // The client filters by discipline and by named range, so it receives the
  // sessions themselves rather than pre-computed totals.

  // Training first. Everyday walking is kept for context but never merged in.
  const sessionTotals = PERIODS.map((p) => workoutPeriodTotal(workouts, p, today));
  const dailyTotals = PERIODS.map((p) => periodTotal(days, p, today));

  // Projection is run off session miles, since that is the headline now.
  const projections = Object.fromEntries(
    sessionTotals.map((t) => [
      t.period,
      projectPeriod(
        { ...dailyTotals.find((d) => d.period === t.period)!, milesPerDay: t.daysElapsed > 0 ? t.miles / t.daysElapsed : 0 },
        today,
      ),
    ]),
  );

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Mileage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Training distance by week, month and year. Everyday walking is tracked separately
          at the bottom.
        </p>
      </div>
      <MileageClient
        sessions={workouts}
        today={today}
        dailyTotals={dailyTotals}
        dailyMonthly={monthlyBuckets(days, today.slice(0, 4))}
        projections={projections}
        year={today.slice(0, 4)}
      />
    </main>
  );
}
