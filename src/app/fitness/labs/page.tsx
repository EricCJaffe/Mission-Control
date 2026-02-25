import { supabaseServer } from '@/lib/supabase/server';
import LabResultsClient from '@/components/fitness/LabResultsClient';

export const dynamic = 'force-dynamic';

export default async function LabResultsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: labResults } = await supabase
    .from('lab_results')
    .select('id, lab_date, lab_type, provider, file_name, ai_analysis, ai_flags, parsed_results, notes, created_at')
    .eq('user_id', user.id)
    .order('lab_date', { ascending: false })
    .limit(50);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Lab Results</h1>
        <p className="mt-1 text-sm text-slate-500">Upload bloodwork and imaging results. AI analyzes them in context of your cardiac health.</p>
      </div>
      <LabResultsClient results={labResults ?? []} />
    </main>
  );
}
