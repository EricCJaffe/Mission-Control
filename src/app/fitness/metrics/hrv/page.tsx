import { supabaseServer } from '@/lib/supabase/server';
import HRVDashboardClient from '@/components/fitness/HRVDashboardClient';

export const dynamic = 'force-dynamic';

export default async function HRVPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Get last 90 days of HRV data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: hrvData } = await supabase
    .from('body_metrics')
    .select('metric_date, hrv_ms')
    .eq('user_id', user.id)
    .gte('metric_date', ninetyDaysAgo.toISOString().split('T')[0])
    .not('hrv_ms', 'is', null)
    .order('metric_date', { ascending: true });

  // Get saved AI insights for HRV
  const { data: insights } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('user_id', user.id)
    .eq('insight_type', 'hrv_analysis')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Heart Rate Variability (HRV)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor your nervous system balance and recovery status with daily HRV tracking
        </p>
      </div>

      <HRVDashboardClient
        hrvData={hrvData || []}
        savedInsight={insights}
      />
    </main>
  );
}
