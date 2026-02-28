import { supabaseServer } from '@/lib/supabase/server';
import SleepDashboardClient from '@/components/fitness/SleepDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sleep Tracking | Fitness',
};

export default async function SleepPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch sleep logs (last 90 days)
  const { data: sleepLogs } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('sleep_date', { ascending: false })
    .limit(90);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Sleep Tracking</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor sleep quality, duration, stages, and heart rate during sleep.
        </p>
      </div>

      <SleepDashboardClient sleepLogs={sleepLogs || []} />
    </main>
  );
}
