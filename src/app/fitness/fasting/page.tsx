import { supabaseServer } from '@/lib/supabase/server';
import FastingTrackerClient from '@/components/fitness/FastingTrackerClient';

export const dynamic = 'force-dynamic';

export default async function FastingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch fasting logs (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: fastingLogs, error } = await supabase
    .from('fasting_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('fast_start', thirtyDaysAgo.toISOString())
    .order('fast_start', { ascending: false });

  if (error) {
    console.error('Error fetching fasting logs:', error);
  }

  // Fetch upcoming planned workouts (next 7 days) for AI advisor
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const { data: upcomingWorkouts } = await supabase
    .from('planned_workouts')
    .select('scheduled_date, day_label, workout_type, prescribed')
    .eq('user_id', user.id)
    .gte('scheduled_date', today)
    .lte('scheduled_date', sevenDaysFromNow.toISOString().slice(0, 10))
    .order('scheduled_date');

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Fasting Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track intermittent fasting windows with AI-powered timing advice
        </p>
      </div>
      <FastingTrackerClient
        fastingLogs={fastingLogs || []}
        upcomingWorkouts={upcomingWorkouts || []}
      />
    </main>
  );
}
