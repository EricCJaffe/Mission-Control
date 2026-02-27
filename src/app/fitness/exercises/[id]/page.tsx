import { supabaseServer } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ExerciseDetailClient from '@/components/fitness/ExerciseDetailClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ExerciseDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // Fetch exercise details
  const { data: exercise, error: exError } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single();

  if (exError || !exercise) notFound();

  // Debug: Check all set logs for this user (to see what exercise_ids exist)
  const { data: allUserSets } = await supabase
    .from('set_logs')
    .select(`
      exercise_id,
      exercises(name),
      workout_logs!inner(user_id)
    `)
    .eq('workout_logs.user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('[Debug] Recent set logs:', allUserSets?.map(s => ({
    exercise_id: s.exercise_id,
    name: (s as any).exercises?.name
  })));

  // Fetch all set logs for this exercise
  const { data: setLogs, error: setsError } = await supabase
    .from('set_logs')
    .select(`
      *,
      workout_logs!inner(
        id,
        workout_date,
        workout_type,
        duration_minutes,
        rpe_session,
        notes
      )
    `)
    .eq('exercise_id', id)
    .order('workout_logs(workout_date)', { ascending: false });

  console.log('[Exercise Detail] Exercise ID:', id);
  console.log('[Exercise Detail] Exercise name:', exercise.name);
  console.log('[Exercise Detail] Set logs count:', setLogs?.length || 0);
  console.log('[Exercise Detail] Error:', setsError);

  if (setsError) {
    console.error('Error fetching set logs:', setsError);
  }

  // Fetch estimated 1RM records for this exercise
  const { data: oneRmRecords, error: oneRmError } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', user.id)
    .eq('exercise_id', id)
    .eq('record_type', 'estimated_1rm')
    .order('achieved_date', { ascending: true });

  if (oneRmError) {
    console.error('Error fetching 1RM records:', oneRmError);
  }

  return (
    <ExerciseDetailClient
      exercise={exercise}
      setLogs={setLogs || []}
      oneRmRecords={oneRmRecords || []}
    />
  );
}
