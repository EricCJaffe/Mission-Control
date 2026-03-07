import RecoverySessionsClient from '@/components/fitness/RecoverySessionsClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RecoveryPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [{ data: sessions }, { data: recentWorkouts }] = await Promise.all([
    supabase
      .from('recovery_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('session_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('workout_logs')
      .select('id, workout_date, workout_type, duration_minutes')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: false })
      .limit(12),
  ]);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Recovery</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track sauna, cold plunge, stretching, and mobility as structured recovery inputs.
        </p>
      </div>
      <RecoverySessionsClient
        initialSessions={sessions || []}
        recentWorkouts={recentWorkouts || []}
      />
    </main>
  );
}
