import { supabaseServer } from '@/lib/supabase/server';
import BPDashboardClient from '@/components/fitness/BPDashboardClient';

export const dynamic = 'force-dynamic';

export default async function BPPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: readings } = await supabase
    .from('bp_readings')
    .select('id, reading_date, systolic, diastolic, pulse, flag_level, position, arm, time_of_day, pre_or_post_meds, pre_or_post_workout, notes')
    .eq('user_id', user.id)
    .order('reading_date', { ascending: false })
    .limit(90);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Blood Pressure</h1>
        <p className="mt-1 text-sm text-slate-500">Track readings, spot trends, flag outliers.</p>
      </div>
      <BPDashboardClient readings={readings ?? []} />
    </main>
  );
}
