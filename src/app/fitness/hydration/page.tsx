import HydrationClient from '@/components/fitness/HydrationClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HydrationPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [{ data: logs }, { data: target }, { data: metrics }] = await Promise.all([
    supabase
      .from('hydration_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('log_date', fourteenDaysAgo.toISOString().slice(0, 10))
      .order('log_date', { ascending: false }),
    supabase
      .from('hydration_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('body_metrics')
      .select('metric_date, weight_lbs, resting_hr, hydration_lbs')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(7),
  ]);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Hydration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Daily intake/output tracking, cardiac-aware targets, electrolyte guidance, and lab-linked AI insights.
        </p>
      </div>
      <HydrationClient
        initialLogs={logs || []}
        initialTarget={target}
        recentMetrics={metrics || []}
      />
    </main>
  );
}
