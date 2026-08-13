import RecoverySessionsClient from '@/components/fitness/RecoverySessionsClient';
import RecoveryTrends from '@/components/fitness/RecoveryTrends';
import { computeRecoveryTrends } from '@/lib/fitness/recovery-trends';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RecoveryPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [{ data: sessions }, { data: recentWorkouts }, { data: allSessions }, { data: metrics }] =
    await Promise.all([
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
    // A 90-day window for the trend view — the 14-day list above is the log,
    // this is the picture.
    supabase
      .from('recovery_sessions')
      .select('id, session_date, modality, sub_type, duration_min, temperature_f, perceived_recovery, energy_before, energy_after, soreness_before, soreness_after')
      .eq('user_id', user.id)
      .gte('session_date', ninetyDaysAgo.toISOString().slice(0, 10))
      .order('session_date', { ascending: false }),
    supabase
      .from('body_metrics')
      .select('metric_date, hrv_ms, resting_hr')
      .eq('user_id', user.id)
      .gte('metric_date', ninetyDaysAgo.toISOString().slice(0, 10))
      .order('metric_date', { ascending: false }),
  ]);

  const trends = computeRecoveryTrends(allSessions ?? [], metrics ?? [], { windowDays: 90 });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Recovery</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track sauna, steam room, jacuzzi, cold plunge, stretching, and mobility as structured
          recovery inputs.
        </p>
      </div>
      <div className="mb-6">
        <RecoveryTrends trends={trends} />
      </div>

      <RecoverySessionsClient
        initialSessions={sessions || []}
        recentWorkouts={recentWorkouts || []}
      />
    </main>
  );
}
