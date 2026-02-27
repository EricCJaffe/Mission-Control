import { supabaseServer } from '@/lib/supabase/server';
import GeneticsClient from '@/components/fitness/GeneticsClient';

export const dynamic = 'force-dynamic';

export default async function GeneticsPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch all genetic markers
  const { data: markers, error } = await supabase
    .from('genetic_markers')
    .select('*')
    .eq('user_id', user.id)
    .order('gene');

  if (error) {
    console.error('Error fetching genetic markers:', error);
  }

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Genetics & Methylation</h1>
        <p className="mt-1 text-sm text-slate-500">
          SNP data from genetic testing (23andMe, methylation reports, etc.)
        </p>
      </div>
      <GeneticsClient markers={markers || []} />
    </main>
  );
}
