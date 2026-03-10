import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import BodyCompositionDashboardClient from '@/components/fitness/BodyCompositionDashboardClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Body Composition | Fitness',
  description: 'Withings body composition trends, summaries, and history drill-downs.',
};

export default async function BodyCompositionPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: metrics } = await supabase
    .from('body_metrics')
    .select('metric_date, weight_lbs, body_fat_pct, muscle_mass_lbs, bone_mass_lbs, hydration_lbs')
    .eq('user_id', user.id)
    .order('metric_date', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Body Composition</h1>
        <p className="mt-1 text-sm text-slate-500">Withings composition trends, 30/90-day averages, and filtered history drill-downs.</p>
      </div>
      <BodyCompositionDashboardClient metrics={metrics ?? []} />
    </main>
  );
}
