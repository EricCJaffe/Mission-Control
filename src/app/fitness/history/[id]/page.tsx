import { supabaseServer } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import WorkoutDetailClient from '@/components/fitness/WorkoutDetailClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function WorkoutDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  // Fetch workout log
  const { data: workout, error: workoutError } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (workoutError || !workout) notFound();

  // Fetch all sets for this workout
  const { data: sets, error: setsError } = await supabase
    .from('set_logs')
    .select(`
      *,
      exercises(id, name, category, equipment)
    `)
    .eq('workout_log_id', id)
    .order('id');

  if (setsError) {
    console.error('Error fetching sets:', setsError);
  }

  // Fetch cardio data if it's a cardio workout
  let cardioData = null;
  if (workout.workout_type === 'cardio' || workout.workout_type === 'hybrid') {
    const { data: cardio } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('workout_log_id', id)
      .single();
    cardioData = cardio;
  }

  return (
    <WorkoutDetailClient
      workout={workout}
      sets={sets || []}
      cardioData={cardioData}
    />
  );
}
