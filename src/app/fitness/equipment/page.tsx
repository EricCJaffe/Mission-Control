import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import EquipmentClient from '@/components/fitness/EquipmentClient';

export const dynamic = 'force-dynamic';

export default async function EquipmentPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('user_id', user.id)
    .order('status', { ascending: true })
    .order('name', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Equipment</h1>
          <p className="mt-1 text-sm text-slate-500">Track mileage and maintenance for shoes, bikes, and gear.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <EquipmentClient items={equipment ?? []} />
    </main>
  );
}
