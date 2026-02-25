import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import LabPanelsClient from '@/components/fitness/LabPanelsClient';

export const dynamic = 'force-dynamic';

export default async function LabResultsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: panels } = await supabase
    .from('lab_panels')
    .select('id, panel_date, lab_name, ordering_provider, source_type, ai_extracted, ai_summary, fasting, notes, created_at')
    .eq('user_id', user.id)
    .order('panel_date', { ascending: false })
    .limit(50);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Lab Results</h1>
          <p className="mt-1 text-sm text-slate-500">Upload bloodwork and imaging results. AI extracts values and tracks trends.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <LabPanelsClient panels={panels ?? []} />
    </main>
  );
}
