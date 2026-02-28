import { supabaseServer } from '@/lib/supabase/server';
import RHRDashboardClient from '@/components/fitness/RHRDashboardClient';

export const dynamic = 'force-dynamic';

export default async function RHRPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Get last 90 days of RHR data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: rhrData } = await supabase
    .from('body_metrics')
    .select('metric_date, resting_hr')
    .eq('user_id', user.id)
    .gte('metric_date', ninetyDaysAgo.toISOString().split('T')[0])
    .not('resting_hr', 'is', null)
    .order('metric_date', { ascending: true });

  // Get saved AI insights for RHR
  const { data: insights } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', user.id)
    .eq('insight_type', 'rhr_analysis')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Resting Heart Rate</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your cardiovascular fitness and recovery with daily RHR monitoring
        </p>
      </div>

      <RHRDashboardClient
        rhrData={rhrData || []}
        savedInsight={insights}
      />
    </main>
  );
}
