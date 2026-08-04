import { supabaseServer } from '@/lib/supabase/server';
import PersonalRecordsClient from '@/components/fitness/PersonalRecordsClient';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Fetch personal records
  const { data: records } = await supabase
    .from('personal_records')
    .select('id, exercise_id, record_type, value, unit, achieved_date, notes')
    .eq('user_id', user.id)
    .order('achieved_date', { ascending: false });

  // Fetch exercise names
  const exerciseIds = [...new Set((records ?? []).filter(r => r.exercise_id).map(r => r.exercise_id))];
  let exerciseMap: Record<string, string> = {};

  if (exerciseIds.length > 0) {
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id, name')
      .in('id', exerciseIds);
    if (exercises) {
      exerciseMap = Object.fromEntries(exercises.map(e => [e.id, e.name]));
    }
  }

  /*
   * Current bests come from actual training, not from personal_records.
   *
   * That table only gains a row when something is a NEW best, so it is a
   * record of peaks — it can never say "here is what you are lifting now",
   * because a current lift below the peak is never written to it.
   *
   * Twelve months of sets are pulled once and the client narrows to 6 or 12
   * months from there, which avoids a refetch on every window change.
   */
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: recentSets, error: setsError } = await supabase
    .from('set_logs')
    .select('exercise_id, set_type, reps, weight_lbs, workout_logs!inner(user_id, workout_date)')
    .eq('workout_logs.user_id', user.id)
    .gte('workout_logs.workout_date', twelveMonthsAgo.toISOString())
    .limit(10000);

  if (setsError) console.error('[records] recent sets:', setsError.message);

  const setRows = (recentSets ?? []).map((row) => {
    const rel = row as unknown as { workout_logs: { workout_date: string } };
    return {
      exercise_id: row.exercise_id,
      set_type: row.set_type,
      reps: row.reps,
      weight_lbs: row.weight_lbs,
      workout_date: rel.workout_logs.workout_date,
    };
  });

  const enriched = (records ?? []).map(r => ({
    ...r,
    exercise_name: r.exercise_id ? exerciseMap[r.exercise_id] ?? 'Unknown' : null,
  }));

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Personal Records</h1>
        <p className="mt-1 text-sm text-slate-500">
          What you are lifting now, with your all-time bests alongside.
        </p>
      </div>
      <PersonalRecordsClient records={enriched} recentSets={setRows} />
    </main>
  );
}
