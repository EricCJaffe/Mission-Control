import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import MedicationsClient from '@/components/fitness/MedicationsClient';

export const dynamic = 'force-dynamic';

export default async function MedicationsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: medications } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', user.id)
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Medications</h1>
          <p className="mt-1 text-sm text-slate-500">Prescriptions, OTC, supplements — tracked for AI safety awareness.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <MedicationsClient medications={medications ?? []} />
    </main>
  );
}
