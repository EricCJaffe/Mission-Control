import { Dumbbell, History, CalendarRange, Trophy, LayoutTemplate, Route, Footprints } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import SectionHub from '@/components/fitness/SectionHub';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Train | Fitness' };

export default async function TrainPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Counts on the cards, so the hub says what is behind each link rather than
  // making you open it to find out.
  const [{ count: workouts }, { count: plans }, { count: templates }, { count: records }] =
    await Promise.all([
      supabase.from('workout_logs').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('training_plans').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
      supabase.from('workout_templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('personal_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

  return (
    <SectionHub
      title="Train"
      subtitle="Logging, history, plans and the numbers that come out of them."
      cards={[
        { href: '/fitness/log', title: 'Log a workout', body: 'Strength, run, bike, jiu-jitsu, walk or mobility.', icon: <Dumbbell className="h-5 w-5 text-blue-700" /> },
        { href: '/fitness/history', title: 'History', body: 'Every session, with the detail behind each one.', icon: <History className="h-5 w-5 text-slate-600" />, meta: `${workouts ?? 0} logged` },
        { href: '/fitness/plans', title: 'Training plans', body: 'Concurrent blocks — strength and cardio run in parallel.', icon: <CalendarRange className="h-5 w-5 text-slate-600" />, meta: `${plans ?? 0} active` },
        { href: '/fitness/records', title: 'Records', body: 'What you are lifting now, with all-time bests alongside.', icon: <Trophy className="h-5 w-5 text-slate-600" />, meta: `${records ?? 0} records` },
        { href: '/fitness/templates', title: 'Templates', body: 'The Push/Pull split the logger pre-fills from.', icon: <LayoutTemplate className="h-5 w-5 text-slate-600" />, meta: `${templates ?? 0} templates` },
        { href: '/fitness/mileage', title: 'Mileage', body: 'Training distance by week, month and year.', icon: <Route className="h-5 w-5 text-slate-600" /> },
        { href: '/fitness/mobility', title: 'Running dynamics', body: 'Stride mechanics and gait quality from the watch.', icon: <Footprints className="h-5 w-5 text-slate-600" /> },
        { href: '/fitness/exercises', title: 'Exercise library', body: 'Every movement, with its own history.', icon: <Dumbbell className="h-5 w-5 text-slate-600" /> },
      ]}
    />
  );
}
