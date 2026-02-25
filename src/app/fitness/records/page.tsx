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

  const enriched = (records ?? []).map(r => ({
    ...r,
    exercise_name: r.exercise_id ? exerciseMap[r.exercise_id] ?? 'Unknown' : null,
  }));

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Personal Records</h1>
        <p className="mt-1 text-sm text-slate-500">Your all-time bests across strength, cardio, and health metrics.</p>
      </div>
      <PersonalRecordsClient records={enriched} />
    </main>
  );
}
